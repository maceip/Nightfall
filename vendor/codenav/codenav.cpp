// codenav — C++20 port of the Python codenav CLI.
//
// Queries the output of KDAB codebrowser_generator to give coding/review
// agents: source by line range, cross-references, definitions, symbol
// search, per-file symbol lists, "what's at this file:line", and caller /
// callee queries.
//
// Data layout consumed (identical to the Python tool):
//   <data>/fileIndex
//   <data>/refs/<symbol>                 XML-ish records:
//     <dec f='..' l='N' [type='..']/>
//     <def f='..' l='N' [ll='N'] [type='..']/>
//     <use f='..' l='N' u='c|r|w|a|m' c='enclosing'/>
//     <doc f='..' l='N'>text</doc>
//     <size>N</size> / <offset>N</offset>
//     <ovr r='..'/> / <inh r='..'/>
//   <data>/fnSearch/<2-char-prefix>      'ref|displayname' lines

#include <algorithm>
#include <cctype>
#include <climits>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <filesystem>
#include <fstream>
#include <functional>
#include <iostream>
#include <map>
#include <optional>
#include <queue>
#include <set>
#include <sstream>
#include <string>
#include <string_view>
#include <unordered_map>
#include <unordered_set>
#include <utility>
#include <vector>

namespace fs = std::filesystem;
using std::string;
using std::string_view;
using std::vector;
using std::optional;

// ----- small helpers ------------------------------------------------------

static string slurp(const fs::path& p) {
    std::ifstream f(p, std::ios::binary);
    if (!f) return {};
    std::ostringstream ss;
    ss << f.rdbuf();
    return ss.str();
}

static vector<string> split_lines(const string& s) {
    vector<string> out;
    size_t start = 0;
    for (size_t i = 0; i < s.size(); ++i) {
        if (s[i] == '\n') {
            out.emplace_back(s.data() + start, i - start);
            start = i + 1;
        }
    }
    if (start < s.size()) out.emplace_back(s.data() + start, s.size() - start);
    return out;
}

static string xml_unescape(string_view s) {
    string out;
    out.reserve(s.size());
    for (size_t i = 0; i < s.size();) {
        if (s[i] == '&') {
            if (s.substr(i, 4) == "&lt;")       { out += '<';  i += 4; continue; }
            if (s.substr(i, 4) == "&gt;")       { out += '>';  i += 4; continue; }
            if (s.substr(i, 5) == "&amp;")      { out += '&';  i += 5; continue; }
            if (s.substr(i, 6) == "&apos;")     { out += '\''; i += 6; continue; }
            if (s.substr(i, 6) == "&quot;")     { out += '"';  i += 6; continue; }
        }
        out += s[i++];
    }
    return out;
}

static string json_str(string_view s) {
    string out = "\"";
    for (unsigned char c : s) {
        switch (c) {
        case '"':  out += "\\\""; break;
        case '\\': out += "\\\\"; break;
        case '\n': out += "\\n";  break;
        case '\r': out += "\\r";  break;
        case '\t': out += "\\t";  break;
        case '\b': out += "\\b";  break;
        case '\f': out += "\\f";  break;
        default:
            if (c < 0x20) {
                char buf[8];
                std::snprintf(buf, sizeof(buf), "\\u%04x", c);
                out += buf;
            } else {
                out += static_cast<char>(c);
            }
        }
    }
    out += '"';
    return out;
}

// Minimal glob: '*' matches any chars, '?' matches one char. Enough for the
// patterns agents pass as --file filters ("openssh/*.c", "*ssh*.c", etc.).
static bool glob_match(string_view pat, string_view s) {
    size_t pi = 0, si = 0, star = string::npos, match = 0;
    while (si < s.size()) {
        if (pi < pat.size() && (pat[pi] == '?' || pat[pi] == s[si])) {
            pi++; si++;
        } else if (pi < pat.size() && pat[pi] == '*') {
            star = pi++;
            match = si;
        } else if (star != string::npos) {
            pi = star + 1;
            si = ++match;
        } else {
            return false;
        }
    }
    while (pi < pat.size() && pat[pi] == '*') pi++;
    return pi == pat.size();
}

// Mirror codebrowser's replace_invalid_filename_chars (generator/filesystem.cpp):
// the only substitution is ':' -> '.'. Names >170 chars get truncated and a
// 24-bit hash appended — we can't reproduce libstdc++'s hash exactly but
// that only affects very long mangled template names and matters in practice
// for <1% of symbols. Pass `Class::method` in, get `Class..method` on disk.
static string sanitize_symbol(const string& sym) {
    string out = sym;
    std::replace(out.begin(), out.end(), ':', '.');
    if (out.size() > 170) {
        uint32_t h = static_cast<uint32_t>(std::hash<string>{}(sym)) & 0x00FFFFFFu;
        out.resize(150);
        out += std::to_string(h);
    }
    return out;
}

// ----- record type + parser ----------------------------------------------

struct Record {
    string tag;
    vector<std::pair<string, string>> attrs;
    string body;

    const string* attr(const string& k) const {
        for (auto& a : attrs) if (a.first == k) return &a.second;
        return nullptr;
    }
    optional<string> file() const {
        auto p = attr("f"); return p ? optional{*p} : std::nullopt;
    }
    optional<int> line() const {
        auto p = attr("l"); if (!p) return std::nullopt;
        try { return std::stoi(*p); } catch (...) { return std::nullopt; }
    }
};

// Hand-written parser: std::regex is slow on the ~8k refs files, and the
// doc-body content can legally contain angle brackets that confuse a regex
// match. A tiny state machine keeps us honest and ~10x faster.
static vector<Record> parse_records(string_view text) {
    vector<Record> out;
    size_t i = 0;
    while (i < text.size()) {
        size_t lt = text.find('<', i);
        if (lt == string::npos) break;
        size_t ts = lt + 1, te = ts;
        while (te < text.size() &&
               (std::isalnum((unsigned char)text[te]) || text[te] == '_')) te++;
        if (te == ts) { i = lt + 1; continue; }
        Record r;
        r.tag = string(text.substr(ts, te - ts));
        size_t p = te;
        bool empty = false;
        while (p < text.size()) {
            while (p < text.size() && std::isspace((unsigned char)text[p])) p++;
            if (p >= text.size()) break;
            if (text[p] == '/' && p + 1 < text.size() && text[p + 1] == '>') {
                empty = true; p += 2; break;
            }
            if (text[p] == '>') { p++; break; }
            size_t ns = p;
            while (p < text.size() &&
                   (std::isalnum((unsigned char)text[p]) || text[p] == '_')) p++;
            if (p == ns) { p++; continue; }  // malformed; skip one char
            string name(text.substr(ns, p - ns));
            if (p >= text.size() || text[p] != '=') continue;
            p++;
            if (p >= text.size() || text[p] != '\'') continue;
            p++;
            string value;
            while (p < text.size() && text[p] != '\'') {
                if (text[p] == '\\' && p + 1 < text.size()) {
                    value += text[p + 1]; p += 2;
                } else {
                    value += text[p++];
                }
            }
            if (p < text.size()) p++;  // closing '
            r.attrs.emplace_back(std::move(name), xml_unescape(value));
        }
        if (!empty) {
            string close = "</" + r.tag + ">";
            size_t end = text.find(close, p);
            if (end != string::npos) {
                r.body = xml_unescape(text.substr(p, end - p));
                p = end + close.size();
            } else {
                p = text.size();
            }
        }
        out.push_back(std::move(r));
        i = p;
    }
    return out;
}

// ----- CodeNav -----------------------------------------------------------

static const std::map<string, string> USE_KINDS = {
    {"c", "call"}, {"r", "read"}, {"w", "write"},
    {"a", "address"}, {"m", "member"},
};

struct CodeNav {
    fs::path data_dir;
    fs::path refs_dir;
    fs::path fnsearch_dir;
    fs::path file_index;
    optional<fs::path> src_root;

    CodeNav(fs::path d, optional<fs::path> s)
        : data_dir(std::move(d)), src_root(std::move(s)) {
        refs_dir = data_dir / "refs";
        fnsearch_dir = data_dir / "fnSearch";
        file_index = data_dir / "fileIndex";
        if (!fs::is_directory(data_dir)) {
            std::cerr << "data dir not found: " << data_dir << "\n";
            std::exit(2);
        }
    }

    vector<Record> load_symbol(const string& sym) const {
        return parse_records(slurp(refs_dir / sanitize_symbol(sym)));
    }

    bool symbol_exists(const string& sym) const {
        return fs::exists(refs_dir / sanitize_symbol(sym));
    }

    vector<string> project_files() const {
        vector<string> out;
        if (!fs::exists(file_index)) return out;
        std::ifstream f(file_index);
        string line;
        while (std::getline(f, line)) if (!line.empty()) out.push_back(line);
        return out;
    }

    // Coerce a path the user typed into the 'project/rel' form codebrowser
    // stores in f='..' attributes. Accepts absolute paths inside src_root,
    // already-project-relative paths (pass-through), and cwd-relative paths
    // that resolve inside src_root.
    string normalize_project_path(const string& s) const {
        if (!src_root) return s;
        const string proj = src_root->filename().string();
        if (s == proj || (s.size() > proj.size() &&
                          s.compare(0, proj.size(), proj) == 0 &&
                          s[proj.size()] == '/')) {
            return s;
        }
        fs::path p = s;
        std::error_code ec;
        fs::path root = fs::weakly_canonical(*src_root, ec);
        auto make_rel = [&](const fs::path& abs) -> optional<string> {
            fs::path rel = fs::relative(abs, root, ec);
            if (ec || rel.empty() || rel.native().rfind("..", 0) == 0) return std::nullopt;
            return proj + "/" + rel.generic_string();
        };
        if (p.is_absolute()) {
            if (auto r = make_rel(fs::weakly_canonical(p, ec))) return *r;
            return s;
        }
        fs::path abs = fs::weakly_canonical(fs::current_path() / p, ec);
        if (auto r = make_rel(abs)) return *r;
        return s;
    }

    optional<fs::path> resolve_source(const string& proj_path) const {
        if (!src_root) return std::nullopt;
        const string proj = src_root->filename().string();
        // Typical: project-relative path with leading project name.
        if (proj_path.size() > proj.size() &&
            proj_path.compare(0, proj.size(), proj) == 0 &&
            proj_path[proj.size()] == '/') {
            fs::path p = *src_root / proj_path.substr(proj.size() + 1);
            if (fs::exists(p)) return p;
        }
        fs::path p = src_root->parent_path() / proj_path;
        if (fs::exists(p)) return p;
        p = *src_root / proj_path;
        if (fs::exists(p)) return p;
        return std::nullopt;
    }
};

// ----- JSON output helpers ------------------------------------------------

static string rec_to_json(const Record& r) {
    string out = "{";
    out += "\"tag\":" + json_str(r.tag);
    for (auto& a : r.attrs) {
        out += ',';
        out += json_str(a.first) + ":" + json_str(a.second);
    }
    if (r.tag == "use") {
        auto u = r.attr("u");
        if (u) {
            auto it = USE_KINDS.find(*u);
            if (it != USE_KINDS.end())
                out += ",\"kind\":" + json_str(it->second);
        }
    }
    if (!r.body.empty()) out += ",\"body\":" + json_str(r.body);
    out += "}";
    return out;
}

template <class It, class F>
static string join_json_array(It begin, It end, F&& fn) {
    string out = "[";
    for (auto it = begin; it != end; ++it) {
        if (it != begin) out += ",";
        out += fn(*it);
    }
    out += "]";
    return out;
}

// ----- CLI / args --------------------------------------------------------

struct Args {
    string data_dir;
    string src_root;
    bool json = false;
    string cmd;
    vector<string> rest;
    std::map<string, string> opts;  // long --flag=value or --flag value
    std::map<string, bool> flags;   // long --flag (no value)
};

static void usage() {
    std::cerr << R"(usage: codenav [-d DATA] [-s SRC] [--json] <cmd> [args...]

core:
  show FILE [N | N:M | N: | :M] [--annotate]   print source by range; with
                                               --annotate, tag each line with
                                               the symbols referenced on it
  refs SYM [--kind c|r|w|a|m|call|read|write|address|member|all] [--file GLOB]
  def SYM                               declarations and definitions
  info SYM                              all metadata
  search QUERY [--limit N] [--force]    fuzzy search via fnSearch
  symbols FILE                          symbols defined in a file
  at FILE:LINE[:COL]                    what symbol is at this location
  callers SYM                           group call sites by caller
  callees FN                            calls made from FN's body
  files [GLOB]                          list indexed project files

callgraph / review:
  enclosing FILE:LINE                   smallest def range containing LINE
  callpath SRC DST [--max-depth N]      shortest call chain SRC -> ... -> DST
  reachable FN [--direction calls|called-by] [--depth N]
                                        BFS over the call graph from FN
  body FN                               print the source of FN's definition(s)
  struct NAME                           member layout with offsets + types

C++ specific:
  hierarchy CLASS [--direction up|down] [--depth N]
                                        transitive bases or derived classes
  overrides METHOD                      what this overrides + what overrides it
  members CLASS                         rich class view: bases, fields,
                                        statics, methods with signatures
  resolve QUERY [--limit N]             map display name -> on-disk ref name

env: CODENAV_DATA (=-d), CODENAV_SRC (=-s)
)";
}

static Args parse_args(int argc, char** argv) {
    Args a;
    if (const char* e = std::getenv("CODENAV_DATA")) a.data_dir = e;
    if (const char* e = std::getenv("CODENAV_SRC"))  a.src_root = e;
    int i = 1;
    // Global flags (order-independent before the subcommand).
    while (i < argc) {
        string s = argv[i];
        if (s == "-h" || s == "--help") { usage(); std::exit(0); }
        else if (s == "-d" || s == "--data-dir") { a.data_dir = argv[++i]; }
        else if (s == "-s" || s == "--src-root") { a.src_root = argv[++i]; }
        else if (s == "--json") { a.json = true; }
        else if (!s.empty() && s[0] == '-') {
            std::cerr << "unknown global option: " << s << "\n"; std::exit(2);
        } else {
            a.cmd = s; i++; break;
        }
        i++;
    }
    // Subcommand-specific args. Long options come in three shapes:
    //   --flag             boolean flag (whitelisted below, never eats the next arg)
    //   --key=value        value attached with '='
    //   --key value        value is the next argv (for non-whitelisted flags)
    // Bool whitelisting avoids '--annotate openssh/foo.c' misparsing the path
    // as the flag's value.
    static const std::set<string> BOOL_OPTS = {"annotate", "force"};
    while (i < argc) {
        string s = argv[i];
        if (s.size() > 2 && s[0] == '-' && s[1] == '-') {
            string key = s.substr(2);
            auto eq = key.find('=');
            if (eq != string::npos) {
                a.opts[key.substr(0, eq)] = key.substr(eq + 1);
            } else if (BOOL_OPTS.count(key)) {
                a.flags[key] = true;
            } else if (i + 1 < argc) {
                a.opts[key] = argv[++i];
            } else {
                a.flags[key] = true;
            }
        } else {
            a.rest.push_back(s);
        }
        i++;
    }
    return a;
}

// Parse an N | N:M | N: | :M range specifier against a file of n lines.
static std::pair<int,int> parse_range(const string& spec, int n_lines) {
    if (spec.empty()) return {1, n_lines};
    auto colon = spec.find(':');
    int s = 1, e = n_lines;
    try {
        if (colon == string::npos) { s = e = std::stoi(spec); }
        else {
            if (colon > 0)               s = std::stoi(spec.substr(0, colon));
            if (colon + 1 < spec.size()) e = std::stoi(spec.substr(colon + 1));
        }
    } catch (...) { return {1, n_lines}; }
    if (s < 1) s = 1;
    if (e > n_lines) e = n_lines;
    return {s, e};
}

// ----- commands ----------------------------------------------------------

// Resolve --kind to a canonical single-letter code (c/r/w/a/m), or "" for all.
static string normalize_kind(const string& k) {
    if (k.empty() || k == "all") return "";
    static const std::map<string, string> m = {
        {"c","c"},{"call","c"},
        {"r","r"},{"read","r"},
        {"w","w"},{"write","w"},
        {"a","a"},{"address","a"},
        {"m","m"},{"member","m"},
    };
    auto it = m.find(k);
    return it == m.end() ? "?" : it->second;
}

static int cmd_refs(const CodeNav& nav, const Args& a) {
    if (a.rest.empty()) { std::cerr << "refs: missing SYM\n"; return 2; }
    const string& sym = a.rest[0];
    auto recs = nav.load_symbol(sym);
    if (recs.empty()) { std::cerr << "no data for symbol: " << sym << "\n"; return 1; }
    string kind;
    auto itk = a.opts.find("kind");
    if (itk != a.opts.end()) {
        kind = normalize_kind(itk->second);
        if (kind == "?") { std::cerr << "unknown --kind: " << itk->second << "\n"; return 2; }
    }
    string file_glob;
    auto itf = a.opts.find("file");
    if (itf != a.opts.end()) file_glob = itf->second;

    vector<const Record*> uses;
    for (auto& r : recs) {
        if (r.tag != "use") continue;
        if (!kind.empty()) {
            auto u = r.attr("u"); if (!u || *u != kind) continue;
        }
        if (!file_glob.empty()) {
            auto f = r.attr("f"); if (!f || !glob_match(file_glob, *f)) continue;
        }
        uses.push_back(&r);
    }
    if (a.json) {
        std::cout << join_json_array(uses.begin(), uses.end(),
                                     [](const Record* r){ return rec_to_json(*r); })
                  << "\n";
        return 0;
    }
    for (auto* r : uses) {
        auto f = r->attr("f"); auto l = r->attr("l");
        auto u = r->attr("u"); auto c = r->attr("c");
        string kname = "ref";
        if (u) { auto it = USE_KINDS.find(*u); if (it != USE_KINDS.end()) kname = it->second; }
        std::cout << (f?*f:"?") << ":" << (l?*l:"?") << ": "
                  << kname << (c ? "   in " + *c : "") << "\n";
    }
    std::cerr << "-- " << uses.size() << " reference(s)\n";
    return 0;
}

static int cmd_def(const CodeNav& nav, const Args& a) {
    if (a.rest.empty()) { std::cerr << "def: missing SYM\n"; return 2; }
    const string& sym = a.rest[0];
    auto recs = nav.load_symbol(sym);
    if (recs.empty()) { std::cerr << "no data for symbol: " << sym << "\n"; return 1; }
    vector<const Record*> ds;
    for (auto& r : recs) if (r.tag == "def" || r.tag == "dec") ds.push_back(&r);
    if (a.json) {
        std::cout << join_json_array(ds.begin(), ds.end(),
                                     [](const Record* r){ return rec_to_json(*r); })
                  << "\n";
        return 0;
    }
    for (auto* r : ds) {
        auto f = r->attr("f"); auto l = r->attr("l"); auto ll = r->attr("ll");
        auto t = r->attr("type");
        string kind = r->tag == "def" ? "definition" : "declaration";
        std::cout << (f?*f:"?") << ":" << (l?*l:"?")
                  << (ll ? "-" + *ll : "") << ": " << kind;
        if (t) std::cout << "  [" << *t << "]";
        std::cout << "\n";
    }
    return 0;
}

static int cmd_info(const CodeNav& nav, const Args& a) {
    if (a.rest.empty()) { std::cerr << "info: missing SYM\n"; return 2; }
    const string& sym = a.rest[0];
    auto recs = nav.load_symbol(sym);
    if (recs.empty()) { std::cerr << "no data for symbol: " << sym << "\n"; return 1; }
    std::map<string,int> counts = {{"def",0},{"dec",0},{"use",0},{"doc",0},{"ovr",0},{"inh",0}};
    for (auto& r : recs) if (counts.count(r.tag)) counts[r.tag]++;
    if (a.json) {
        std::cout << "{\"symbol\":" << json_str(sym)
                  << ",\"file\":" << json_str((nav.refs_dir / sanitize_symbol(sym)).string())
                  << ",\"records\":"
                  << join_json_array(recs.begin(), recs.end(),
                                     [](const Record& r){ return rec_to_json(r); })
                  << ",\"counts\":{";
        bool first = true;
        for (auto& [k, v] : counts) {
            if (!first) std::cout << ",";
            first = false;
            std::cout << json_str(k) << ":" << v;
        }
        std::cout << "}}\n";
        return 0;
    }
    std::cout << "symbol: " << sym << "\n"
              << "records in " << (nav.refs_dir / sanitize_symbol(sym)).string() << "\n";
    for (auto& r : recs) {
        if (r.tag == "def") {
            auto f = r.attr("f"); auto l = r.attr("l"); auto ll = r.attr("ll"); auto t = r.attr("type");
            std::cout << "  def  " << (f?*f:"?") << ":" << (l?*l:"?")
                      << (ll ? "-" + *ll : "") << "  [" << (t?*t:"") << "]\n";
        } else if (r.tag == "dec") {
            auto f = r.attr("f"); auto l = r.attr("l"); auto t = r.attr("type");
            std::cout << "  dec  " << (f?*f:"?") << ":" << (l?*l:"?")
                      << "  [" << (t?*t:"") << "]\n";
        } else if (r.tag == "use") {
            auto f = r.attr("f"); auto l = r.attr("l"); auto u = r.attr("u"); auto c = r.attr("c");
            string kname = "ref";
            if (u) { auto it = USE_KINDS.find(*u); if (it != USE_KINDS.end()) kname = it->second; }
            std::cout << "  use  " << (f?*f:"?") << ":" << (l?*l:"?")
                      << "  " << kname << "  in " << (c?*c:"") << "\n";
        } else if (r.tag == "doc") {
            auto f = r.attr("f"); auto l = r.attr("l");
            auto body_lines = split_lines(r.body);
            string first = body_lines.empty() ? "" : body_lines.front();
            std::cout << "  doc  " << (f?*f:"?") << ":" << (l?*l:"?")
                      << "  " << json_str(first);
            if (body_lines.size() > 1) std::cout << "  (+" << (body_lines.size()-1) << " lines)";
            std::cout << "\n";
        } else if (r.tag == "size") {
            std::cout << "  size " << r.body << " bytes\n";
        } else if (r.tag == "offset") {
            std::cout << "  offset " << r.body << " bits\n";
        } else if (r.tag == "ovr") {
            auto rr = r.attr("r"); std::cout << "  overrides " << (rr?*rr:"") << "\n";
        } else if (r.tag == "inh") {
            auto rr = r.attr("r"); std::cout << "  inherits  " << (rr?*rr:"") << "\n";
        } else {
            std::cout << "  " << r.tag << "\n";
        }
    }
    std::cout << "\n  totals:";
    for (auto& [k, v] : counts) std::cout << " " << k << "=" << v;
    std::cout << "\n";
    return 0;
}

static string to_lower(string s) {
    for (auto& c : s) c = (char)std::tolower((unsigned char)c);
    return s;
}

static int cmd_search(const CodeNav& nav, const Args& a) {
    if (a.rest.empty()) { std::cerr << "search: missing QUERY\n"; return 2; }
    string q = a.rest[0];
    int limit = 50;
    if (auto it = a.opts.find("limit"); it != a.opts.end()) limit = std::stoi(it->second);
    bool force = a.flags.count("force");
    if (q.size() < 2 && !force) {
        std::cerr << "query must be >= 2 chars (use --force)\n"; return 1;
    }
    string lq = to_lower(q);
    vector<std::pair<string,string>> hits;
    // fnSearch buckets key on the first two chars of the display name, so
    // prefix-only narrowing misses substring hits (e.g. 'packet_send' is
    // stored under 'ss' as 'ssh_packet_send'). Scan all buckets.
    vector<fs::path> buckets;
    for (auto& e : fs::directory_iterator(nav.fnsearch_dir)) buckets.push_back(e.path());
    std::sort(buckets.begin(), buckets.end());
    for (auto& b : buckets) {
        string text = slurp(b);
        size_t start = 0;
        while (start < text.size()) {
            size_t nl = text.find('\n', start);
            string_view line(text.data() + start,
                             (nl == string::npos ? text.size() : nl) - start);
            auto bar = line.find('|');
            if (bar != string_view::npos) {
                string ref(line.substr(0, bar));
                string name(line.substr(bar + 1));
                string lname = to_lower(name), lref = to_lower(ref);
                if (lname.find(lq) != string::npos ||
                    lref.find(lq) != string::npos) {
                    hits.emplace_back(std::move(ref), std::move(name));
                    if ((int)hits.size() >= limit) goto done;
                }
            }
            if (nl == string::npos) break;
            start = nl + 1;
        }
    }
done:
    if (a.json) {
        std::cout << "[";
        for (size_t i = 0; i < hits.size(); ++i) {
            if (i) std::cout << ",";
            std::cout << "{\"ref\":" << json_str(hits[i].first)
                      << ",\"name\":" << json_str(hits[i].second) << "}";
        }
        std::cout << "]\n";
    } else {
        for (auto& [ref, name] : hits) {
            if (ref == name) std::cout << name << "\n";
            else std::cout << name << "   [ref=" << ref << "]\n";
        }
        std::cerr << "-- " << hits.size() << " match(es)\n";
    }
    return 0;
}

// Iterate every file under refs/, prefilter by substring, then parse.
// The prefilter drops ~99% of files for file-scoped queries.
template <class F>
static void for_each_ref_file(const CodeNav& nav, string_view prefilter, F&& fn) {
    for (auto& e : fs::directory_iterator(nav.refs_dir)) {
        if (!e.is_regular_file()) continue;
        string text = slurp(e.path());
        if (!prefilter.empty() && text.find(prefilter) == string::npos) continue;
        fn(e.path().filename().string(), text);
    }
}

static int cmd_symbols(const CodeNav& nav, const Args& a) {
    if (a.rest.empty()) { std::cerr << "symbols: missing FILE\n"; return 2; }
    string target = nav.normalize_project_path(a.rest[0]);
    string needle = "<def f='" + target + "'";
    vector<std::pair<string, Record>> hits;
    for_each_ref_file(nav, target, [&](const string& name, const string& text) {
        for (auto& r : parse_records(text)) {
            if (r.tag == "def") {
                auto f = r.attr("f");
                if (f && *f == target) hits.emplace_back(name, r);
            }
        }
    });
    std::sort(hits.begin(), hits.end(), [](auto& A, auto& B) {
        auto la = A.second.line().value_or(0);
        auto lb = B.second.line().value_or(0);
        return la < lb;
    });
    if (a.json) {
        std::cout << "[";
        for (size_t i = 0; i < hits.size(); ++i) {
            if (i) std::cout << ",";
            auto& [n, r] = hits[i];
            auto l = r.attr("l"); auto ll = r.attr("ll"); auto t = r.attr("type");
            std::cout << "{\"symbol\":" << json_str(n)
                      << ",\"line\":" << (l?*l:"null")
                      << ",\"endLine\":" << (ll?*ll:"null")
                      << ",\"type\":" << json_str(t?*t:"") << "}";
        }
        std::cout << "]\n";
        return 0;
    }
    for (auto& [name, r] : hits) {
        auto l = r.attr("l"); auto ll = r.attr("ll"); auto t = r.attr("type");
        std::string line_col = l ? *l : "?";
        std::string pad(std::max(0, 6 - (int)line_col.size()), ' ');
        std::cout << pad << line_col << (ll ? "-" + *ll : "") << "  " << name;
        if (t) std::cout << "  [" << *t << "]";
        std::cout << "\n";
    }
    std::cerr << "-- " << hits.size() << " symbol(s) defined in " << target << "\n";
    return 0;
}

static int cmd_at(const CodeNav& nav, const Args& a) {
    if (a.rest.empty()) { std::cerr << "at: missing FILE:LINE\n"; return 2; }
    const string& loc = a.rest[0];
    auto colon = loc.find(':');
    if (colon == string::npos) { std::cerr << "at: expected FILE:LINE\n"; return 2; }
    string fpart = loc.substr(0, colon);
    string rest = loc.substr(colon + 1);
    auto colon2 = rest.find(':');
    string lpart = colon2 == string::npos ? rest : rest.substr(0, colon2);
    string target_file = nav.normalize_project_path(fpart);
    int target_line = std::stoi(lpart);
    string pat = "f='" + target_file + "' l='" + std::to_string(target_line) + "'";
    vector<std::pair<string, Record>> hits;
    for_each_ref_file(nav, pat, [&](const string& name, const string& text) {
        for (auto& r : parse_records(text)) {
            auto f = r.attr("f"); auto l = r.attr("l");
            if (f && *f == target_file && l && std::stoi(*l) == target_line)
                hits.emplace_back(name, r);
        }
    });
    if (a.json) {
        std::cout << join_json_array(hits.begin(), hits.end(),
            [](const std::pair<string,Record>& p) {
                string out = "{\"symbol\":" + json_str(p.first) + ",";
                string body = rec_to_json(p.second);
                // Drop the leading '{' of body and append to our object.
                return out + body.substr(1);
            }) << "\n";
        return 0;
    }
    for (auto& [name, r] : hits) {
        std::cout << r.tag << " " << name;
        if (r.tag == "use") {
            auto u = r.attr("u"); auto c = r.attr("c");
            string kname = "ref";
            if (u) { auto it = USE_KINDS.find(*u); if (it != USE_KINDS.end()) kname = it->second; }
            std::cout << " (" << kname << " in " << (c?*c:"") << ")";
        } else if (r.tag == "def") {
            auto t = r.attr("type"); std::cout << " [" << (t?*t:"") << "]";
        }
        std::cout << "\n";
    }
    std::cerr << "-- " << hits.size() << " symbol(s) at "
              << target_file << ":" << target_line << "\n";
    return 0;
}

static int cmd_callers(const CodeNav& nav, const Args& a) {
    if (a.rest.empty()) { std::cerr << "callers: missing SYM\n"; return 2; }
    const string& sym = a.rest[0];
    auto recs = nav.load_symbol(sym);
    if (recs.empty()) { std::cerr << "no data for symbol: " << sym << "\n"; return 1; }
    std::map<string, vector<const Record*>> by_caller;
    int total = 0;
    for (auto& r : recs) {
        if (r.tag != "use") continue;
        auto u = r.attr("u"); if (!u || *u != "c") continue;
        auto c = r.attr("c");
        by_caller[c ? *c : "<unknown>"].push_back(&r);
        total++;
    }
    if (a.json) {
        std::cout << "{";
        bool first = true;
        for (auto& [name, rs] : by_caller) {
            if (!first) std::cout << ",";
            first = false;
            std::cout << json_str(name) << ":"
                      << join_json_array(rs.begin(), rs.end(),
                         [](const Record* r){ return rec_to_json(*r); });
        }
        std::cout << "}\n";
        return 0;
    }
    for (auto& [name, rs] : by_caller) {
        std::cout << name << "  (" << rs.size() << " call site(s))\n";
        for (auto* r : rs) {
            auto f = r->attr("f"); auto l = r->attr("l");
            std::cout << "    " << (f?*f:"?") << ":" << (l?*l:"?") << "\n";
        }
    }
    std::cerr << "-- " << total << " call(s) from " << by_caller.size()
              << " caller(s)\n";
    return 0;
}

static int cmd_callees(const CodeNav& nav, const Args& a) {
    if (a.rest.empty()) { std::cerr << "callees: missing SYM\n"; return 2; }
    const string& sym = a.rest[0];
    string needle = "c='" + sym + "'";
    std::map<string, vector<Record>> callees;
    int total = 0;
    for_each_ref_file(nav, needle, [&](const string& name, const string& text) {
        for (auto& r : parse_records(text)) {
            if (r.tag != "use") continue;
            auto u = r.attr("u"); auto c = r.attr("c");
            if (u && *u == "c" && c && *c == sym) {
                callees[name].push_back(r);
                total++;
            }
        }
    });
    if (a.json) {
        std::cout << "{";
        bool first = true;
        for (auto& [name, rs] : callees) {
            if (!first) std::cout << ",";
            first = false;
            std::cout << json_str(name) << ":"
                      << join_json_array(rs.begin(), rs.end(),
                         [](const Record& r){ return rec_to_json(r); });
        }
        std::cout << "}\n";
        return 0;
    }
    for (auto& [name, rs] : callees) {
        std::cout << name << "  (" << rs.size() << " call site(s))\n";
        for (auto& r : rs) {
            auto f = r.attr("f"); auto l = r.attr("l");
            std::cout << "    " << (f?*f:"?") << ":" << (l?*l:"?") << "\n";
        }
    }
    std::cerr << "-- " << total << " call(s) to " << callees.size()
              << " distinct callee(s)\n";
    return 0;
}

static int cmd_files(const CodeNav& nav, const Args& a) {
    auto files = nav.project_files();
    if (!a.rest.empty()) {
        const string& g = a.rest[0];
        files.erase(std::remove_if(files.begin(), files.end(),
            [&](const string& f){ return !glob_match(g, f); }),
            files.end());
    }
    if (a.json) {
        std::cout << "[";
        for (size_t i = 0; i < files.size(); ++i) {
            if (i) std::cout << ",";
            std::cout << json_str(files[i]);
        }
        std::cout << "]\n";
    } else {
        for (auto& f : files) std::cout << f << "\n";
    }
    return 0;
}

// ----- callgraph: enclosing / callpath / reachable ----------------------

// "enclosing": given a source location, which function definition's range
// contains it? A file often has many nested scopes recorded as def records
// (functions, inline helpers, lambdas). We return all matches and sort the
// tightest (smallest line-span) first, since that is the immediate enclosing
// scope — useful when agents hand us a line and ask "what am I inside?".
static int cmd_enclosing(const CodeNav& nav, const Args& a) {
    if (a.rest.empty()) { std::cerr << "enclosing: missing FILE:LINE\n"; return 2; }
    const string& loc = a.rest[0];
    auto colon = loc.find(':');
    if (colon == string::npos) { std::cerr << "enclosing: expected FILE:LINE\n"; return 2; }
    string fpart = loc.substr(0, colon);
    int tline;
    try { tline = std::stoi(loc.substr(colon + 1)); }
    catch (...) { std::cerr << "enclosing: bad line number\n"; return 2; }
    string target_file = nav.normalize_project_path(fpart);
    string needle = "f='" + target_file + "'";
    vector<std::pair<string, Record>> hits;
    for_each_ref_file(nav, needle, [&](const string& name, const string& text) {
        for (auto& r : parse_records(text)) {
            if (r.tag != "def") continue;
            auto f = r.attr("f"); auto l = r.attr("l"); auto ll = r.attr("ll");
            if (!f || *f != target_file || !l || !ll) continue;
            try {
                int s = std::stoi(*l), e = std::stoi(*ll);
                if (tline >= s && tline <= e) hits.emplace_back(name, r);
            } catch (...) {}
        }
    });
    std::sort(hits.begin(), hits.end(), [](auto& A, auto& B) {
        int sa = std::stoi(*A.second.attr("l")), ea = std::stoi(*A.second.attr("ll"));
        int sb = std::stoi(*B.second.attr("l")), eb = std::stoi(*B.second.attr("ll"));
        return (ea - sa) < (eb - sb);
    });
    // Heuristic fallback: codebrowser doesn't emit def records for every
    // top-level function (notably main() in C). When no def encloses the
    // requested line, fall back to the 'c=' enclosing-function attribute
    // recorded on use records at/near this line.
    string heuristic_caller;
    if (hits.empty()) {
        std::map<string, int> caller_score;  // closer line => higher score
        for_each_ref_file(nav, needle, [&](const string&, const string& text) {
            for (auto& r : parse_records(text)) {
                if (r.tag != "use") continue;
                auto f = r.attr("f"); if (!f || *f != target_file) continue;
                auto l = r.attr("l"); if (!l) continue;
                auto c = r.attr("c"); if (!c) continue;
                int ln;
                try { ln = std::stoi(*l); } catch (...) { continue; }
                int dist = ln - tline;
                if (dist < -1000 || dist > 1000) continue;
                caller_score[*c] += 1;  // count nearby uses per caller
            }
        });
        if (!caller_score.empty()) {
            auto best = std::max_element(caller_score.begin(), caller_score.end(),
                [](auto& A, auto& B){ return A.second < B.second; });
            heuristic_caller = best->first;
        }
    }
    if (a.json) {
        std::cout << "[";
        for (size_t i = 0; i < hits.size(); ++i) {
            if (i) std::cout << ",";
            auto& [n, r] = hits[i];
            std::cout << "{\"symbol\":" << json_str(n)
                      << ",\"file\":" << json_str(target_file)
                      << ",\"start\":" << *r.attr("l")
                      << ",\"end\":" << *r.attr("ll");
            if (auto t = r.attr("type")) std::cout << ",\"type\":" << json_str(*t);
            std::cout << "}";
        }
        if (hits.empty() && !heuristic_caller.empty()) {
            std::cout << "{\"symbol\":" << json_str(heuristic_caller)
                      << ",\"heuristic\":true}";
        }
        std::cout << "]\n";
        return 0;
    }
    if (hits.empty()) {
        if (!heuristic_caller.empty()) {
            std::cout << heuristic_caller
                      << "  (heuristic: inferred from nearby use records; no def range in refs)\n";
            return 0;
        }
        std::cerr << "no enclosing definition at " << target_file << ":" << tline << "\n";
        return 1;
    }
    for (auto& [name, r] : hits) {
        auto l = r.attr("l"); auto ll = r.attr("ll"); auto t = r.attr("type");
        std::cout << name << "  " << target_file << ":" << (l?*l:"?")
                  << "-" << (ll?*ll:"?");
        if (t) std::cout << "  [" << *t << "]";
        std::cout << "\n";
    }
    return 0;
}

// Edge in the call graph: caller → callee at (file, line).
struct CallEdge {
    string callee;
    string file;
    string line;
};

// Forward call graph: caller → [(callee, file, line), ...]. Requires a full
// scan of refs/* because a caller F's outbound calls are recorded in each
// refs/<callee> file that contains <use u='c' c='F'/>. Reverse direction is
// trivial (refs/<callee> already holds it) so we don't cache that.
static std::map<string, vector<CallEdge>> build_forward_graph(const CodeNav& nav) {
    std::map<string, vector<CallEdge>> g;
    for (auto& e : fs::directory_iterator(nav.refs_dir)) {
        if (!e.is_regular_file()) continue;
        string callee = e.path().filename().string();
        string text = slurp(e.path());
        if (text.find("u='c'") == string::npos) continue;  // cheap prefilter
        for (auto& r : parse_records(text)) {
            if (r.tag != "use") continue;
            auto u = r.attr("u"); if (!u || *u != "c") continue;
            auto c = r.attr("c"); if (!c) continue;
            auto f = r.attr("f"); auto l = r.attr("l");
            g[*c].push_back({callee, f?*f:"", l?*l:""});
        }
    }
    return g;
}

// "callpath SRC DST": find a shortest call chain SRC → ... → DST.
// We do reverse BFS from DST (lazy, one refs-file read per visited node)
// because reverse expansion is O(1) per node while forward expansion needs
// the full-scan graph. When we discover SRC we walk the predecessor map
// back to reconstruct the forward-oriented path.
static int cmd_callpath(const CodeNav& nav, const Args& a) {
    if (a.rest.size() < 2) { std::cerr << "callpath: need SRC and DST\n"; return 2; }
    const string& src = a.rest[0];
    const string& dst = a.rest[1];
    int max_depth = 8;
    if (auto it = a.opts.find("max-depth"); it != a.opts.end())
        max_depth = std::stoi(it->second);

    // visited node → (successor in the discovered forward path, call-site record)
    std::map<string, std::pair<string, Record>> next_of;
    std::queue<std::pair<string, int>> q;
    q.push({dst, 0});
    std::unordered_set<string> visited = {dst};
    bool found = (src == dst);
    while (!q.empty() && !found) {
        auto [node, depth] = q.front(); q.pop();
        if (depth >= max_depth) continue;
        auto recs = nav.load_symbol(node);
        for (auto& r : recs) {
            if (r.tag != "use") continue;
            auto u = r.attr("u"); if (!u || *u != "c") continue;
            auto c = r.attr("c"); if (!c) continue;
            if (!visited.insert(*c).second) continue;
            next_of[*c] = {node, r};
            if (*c == src) { found = true; break; }
            q.push({*c, depth + 1});
        }
    }
    if (!found) {
        std::cerr << "no path from " << src << " to " << dst
                  << " within depth " << max_depth << "\n";
        return 1;
    }
    // Walk next_of from src forward to dst to produce the call-oriented chain.
    vector<std::pair<string, Record>> edges;
    string cur = src;
    while (cur != dst) {
        auto it = next_of.find(cur);
        if (it == next_of.end()) break;
        edges.push_back(it->second);
        cur = it->second.first;
    }
    if (a.json) {
        std::cout << "{\"src\":" << json_str(src)
                  << ",\"dst\":" << json_str(dst)
                  << ",\"edges\":[";
        string prev = src;
        for (size_t i = 0; i < edges.size(); ++i) {
            if (i) std::cout << ",";
            auto& [nxt, r] = edges[i];
            auto f = r.attr("f"); auto l = r.attr("l");
            std::cout << "{\"from\":" << json_str(prev)
                      << ",\"to\":" << json_str(nxt)
                      << ",\"file\":" << json_str(f?*f:"")
                      << ",\"line\":" << json_str(l?*l:"") << "}";
            prev = nxt;
        }
        std::cout << "]}\n";
        return 0;
    }
    std::cout << src << "\n";
    for (auto& [nxt, r] : edges) {
        auto f = r.attr("f"); auto l = r.attr("l");
        std::cout << "  -> " << nxt
                  << "   (call at " << (f?*f:"?") << ":" << (l?*l:"?") << ")\n";
    }
    return 0;
}

// "reachable FN": BFS over the call graph. Direction = 'calls' (transitive
// callees of FN) or 'called-by' (transitive callers). Reverse direction is
// lazy; forward direction builds the forward graph once up front.
static int cmd_reachable(const CodeNav& nav, const Args& a) {
    if (a.rest.empty()) { std::cerr << "reachable: missing FN\n"; return 2; }
    const string& fn = a.rest[0];
    string dir = "calls";
    if (auto it = a.opts.find("direction"); it != a.opts.end()) dir = it->second;
    if (dir != "calls" && dir != "called-by") {
        std::cerr << "reachable: --direction must be calls|called-by\n"; return 2;
    }
    int max_depth = 5;
    if (auto it = a.opts.find("depth"); it != a.opts.end())
        max_depth = std::stoi(it->second);

    std::map<string, vector<CallEdge>> forward;  // only built if needed
    if (dir == "calls") forward = build_forward_graph(nav);

    std::map<string, int> depth_of = {{fn, 0}};
    std::queue<string> q;
    q.push(fn);
    while (!q.empty()) {
        string node = q.front(); q.pop();
        int d = depth_of[node];
        if (d >= max_depth) continue;
        vector<CallEdge> succ;
        if (dir == "calls") {
            auto it = forward.find(node);
            if (it != forward.end()) succ = it->second;
        } else {
            for (auto& r : nav.load_symbol(node)) {
                if (r.tag != "use") continue;
                auto u = r.attr("u"); if (!u || *u != "c") continue;
                auto c = r.attr("c"); if (!c) continue;
                auto f = r.attr("f"); auto l = r.attr("l");
                succ.push_back({*c, f?*f:"", l?*l:""});
            }
        }
        for (auto& e : succ) {
            if (depth_of.count(e.callee)) continue;
            depth_of[e.callee] = d + 1;
            q.push(e.callee);
        }
    }
    depth_of.erase(fn);  // don't report the seed itself
    if (a.json) {
        std::cout << "{\"root\":" << json_str(fn)
                  << ",\"direction\":" << json_str(dir)
                  << ",\"reachable\":[";
        bool first = true;
        for (auto& [name, d] : depth_of) {
            if (!first) std::cout << ",";
            first = false;
            std::cout << "{\"symbol\":" << json_str(name)
                      << ",\"depth\":" << d << "}";
        }
        std::cout << "]}\n";
        return 0;
    }
    // Print by ascending depth, then name.
    vector<std::pair<string,int>> items(depth_of.begin(), depth_of.end());
    std::sort(items.begin(), items.end(), [](auto& A, auto& B) {
        if (A.second != B.second) return A.second < B.second;
        return A.first < B.first;
    });
    for (auto& [name, d] : items)
        std::cout << d << "  " << name << "\n";
    std::cerr << "-- " << items.size() << " symbol(s) reachable from " << fn
              << " (" << dir << ", depth <=" << max_depth << ")\n";
    return 0;
}

// ----- review context: show --annotate / body / struct ------------------

// "show --annotate": interleave each source line with the records from
// refs/* that reference it (tag + symbol + kind/context). Turns raw source
// into something like LSP hovers but offline and scannable.
static void print_annotated_show(const CodeNav& nav,
                                 const fs::path& source_path,
                                 const string& project_path,
                                 int start, int end,
                                 const vector<string>& lines,
                                 bool json) {
    // line number → list of annotation strings.
    std::map<int, vector<string>> ann_txt;
    // For JSON: line number → list of {symbol, tag, kind?, c?} maps.
    std::map<int, vector<Record>> ann_rec;
    std::map<int, vector<string>> ann_sym;
    for_each_ref_file(nav, project_path, [&](const string& sym, const string& text) {
        for (auto& r : parse_records(text)) {
            auto f = r.attr("f"); if (!f || *f != project_path) continue;
            auto l = r.attr("l"); if (!l) continue;
            int ln;
            try { ln = std::stoi(*l); } catch (...) { continue; }
            if (ln < start || ln > end) continue;
            string row;
            if (r.tag == "use") {
                auto u = r.attr("u"); auto c = r.attr("c");
                string kn = "ref";
                if (u) { auto it = USE_KINDS.find(*u); if (it != USE_KINDS.end()) kn = it->second; }
                row = kn + "  " + sym + (c ? "   (in " + *c + ")" : "");
            } else if (r.tag == "def") {
                auto t = r.attr("type");
                row = "def   " + sym + (t ? "   [" + *t + "]" : "");
            } else if (r.tag == "dec") {
                auto t = r.attr("type");
                row = "dec   " + sym + (t ? "   [" + *t + "]" : "");
            } else {
                continue;
            }
            ann_txt[ln].push_back(row);
            ann_rec[ln].push_back(r);
            ann_sym[ln].push_back(sym);
        }
    });
    if (json) {
        std::cout << "{\"file\":" << json_str(source_path.string())
                  << ",\"start\":" << start << ",\"end\":" << end
                  << ",\"lines\":[";
        for (int i = start; i <= end; ++i) {
            if (i > start) std::cout << ",";
            std::cout << "{\"line\":" << i
                      << ",\"text\":" << json_str(lines[i - 1])
                      << ",\"annotations\":[";
            auto itR = ann_rec.find(i);
            auto itS = ann_sym.find(i);
            if (itR != ann_rec.end()) {
                for (size_t k = 0; k < itR->second.size(); ++k) {
                    if (k) std::cout << ",";
                    auto& rec = itR->second[k];
                    std::cout << "{\"symbol\":" << json_str(itS->second[k])
                              << ",\"tag\":" << json_str(rec.tag);
                    for (auto& p : rec.attrs)
                        std::cout << "," << json_str(p.first) << ":" << json_str(p.second);
                    std::cout << "}";
                }
            }
            std::cout << "]}";
        }
        std::cout << "]}\n";
        return;
    }
    int w = (int)std::to_string(end).size();
    for (int i = start; i <= end; ++i) {
        std::cout << std::string(w - std::to_string(i).size(), ' ')
                  << i << " | " << lines[i - 1] << "\n";
        auto it = ann_txt.find(i);
        if (it != ann_txt.end()) {
            for (auto& row : it->second)
                std::cout << std::string(w + 3, ' ') << "· " << row << "\n";
        }
    }
}

// "show": print source by range. With --annotate, interleave each source
// line with records (from refs/*) that reference it — turning the view into
// an offline equivalent of LSP hovers. We look up the project-relative form
// so annotations can join against the f='...' attribute codebrowser uses.
static int cmd_show(const CodeNav& nav, const Args& a) {
    if (a.rest.empty()) { std::cerr << "show: missing FILE\n"; return 2; }
    const string& f = a.rest[0];
    fs::path path;
    if (fs::exists(f)) path = f;
    else if (auto p = nav.resolve_source(f)) path = *p;
    else { std::cerr << "error: source file not found: " << f << "\n"; return 1; }
    string text = slurp(path);
    auto lines = split_lines(text);
    string range = a.rest.size() > 1 ? a.rest[1] : "";
    auto [start, end] = parse_range(range, (int)lines.size());
    bool annotate = a.flags.count("annotate");
    if (annotate) {
        string proj = nav.normalize_project_path(f);
        print_annotated_show(nav, path, proj, start, end, lines, a.json);
        return 0;
    }
    // Fall through to the plain show path.
    if (a.json) {
        std::cout << "{\"file\":" << json_str(path.string())
                  << ",\"start\":" << start << ",\"end\":" << end
                  << ",\"lines\":[";
        for (int i = start; i <= end; ++i) {
            if (i > start) std::cout << ",";
            std::cout << "{\"line\":" << i
                      << ",\"text\":" << json_str(lines[i - 1]) << "}";
        }
        std::cout << "]}\n";
    } else {
        int w = (int)std::to_string(end).size();
        for (int i = start; i <= end; ++i)
            std::cout << std::string(w - std::to_string(i).size(), ' ')
                      << i << " | " << lines[i - 1] << "\n";
    }
    return 0;
}

// "body FN": convenience for (def FN) + (show FILE L:LL). For overloaded
// or multiply-defined symbols (e.g. every <program>/main) we print each body
// separated by a header.
static int cmd_body(const CodeNav& nav, const Args& a) {
    if (a.rest.empty()) { std::cerr << "body: missing FN\n"; return 2; }
    const string& sym = a.rest[0];
    auto recs = nav.load_symbol(sym);
    if (recs.empty()) { std::cerr << "no data for symbol: " << sym << "\n"; return 1; }
    vector<const Record*> defs;
    for (auto& r : recs) if (r.tag == "def") defs.push_back(&r);
    if (defs.empty()) {
        std::cerr << "no definition recorded for " << sym
                  << " (symbol may be a declaration or variable)\n";
        return 1;
    }
    if (a.json) {
        std::cout << "[";
        for (size_t i = 0; i < defs.size(); ++i) {
            if (i) std::cout << ",";
            auto* r = defs[i];
            auto f = r->attr("f"); auto l = r->attr("l"); auto ll = r->attr("ll");
            if (!f || !l || !ll) { std::cout << "null"; continue; }
            auto src = nav.resolve_source(*f);
            string text = src ? slurp(*src) : "";
            auto lines = split_lines(text);
            int s = std::stoi(*l), e = std::stoi(*ll);
            if (e > (int)lines.size()) e = lines.size();
            std::cout << "{\"file\":" << json_str(*f)
                      << ",\"start\":" << s << ",\"end\":" << e
                      << ",\"type\":" << json_str(r->attr("type")?*r->attr("type"):"")
                      << ",\"lines\":[";
            for (int k = s; k <= e; ++k) {
                if (k > s) std::cout << ",";
                std::cout << "{\"line\":" << k
                          << ",\"text\":" << json_str(lines[k-1]) << "}";
            }
            std::cout << "]}";
        }
        std::cout << "]\n";
        return 0;
    }
    for (size_t i = 0; i < defs.size(); ++i) {
        if (i) std::cout << "\n";
        auto* r = defs[i];
        auto f = r->attr("f"); auto l = r->attr("l"); auto ll = r->attr("ll");
        auto t = r->attr("type");
        if (!f || !l || !ll) {
            std::cerr << "def for " << sym << " lacks file/range info\n";
            continue;
        }
        auto src = nav.resolve_source(*f);
        std::cout << "// " << *f << ":" << *l << "-" << *ll;
        if (t) std::cout << "   [" << *t << "]";
        std::cout << "\n";
        if (!src) {
            std::cerr << "can't resolve source: " << *f
                      << " (set -s/--src-root)\n";
            continue;
        }
        string text = slurp(*src);
        auto lines = split_lines(text);
        int s = std::stoi(*l), e = std::stoi(*ll);
        if (e > (int)lines.size()) e = lines.size();
        int w = (int)std::to_string(e).size();
        for (int k = s; k <= e; ++k)
            std::cout << std::string(w - std::to_string(k).size(), ' ')
                      << k << " | " << lines[k-1] << "\n";
    }
    return 0;
}

// "struct NAME": list members with bit-offset and type. codebrowser stores
// top-level struct members at refs/<NAME>..<field> and records the overall
// struct size on refs/<NAME>. We only show immediate members (skip deeper
// ..-qualified names) — nested structs have their own entry.
static int cmd_struct(const CodeNav& nav, const Args& a) {
    if (a.rest.empty()) { std::cerr << "struct: missing NAME\n"; return 2; }
    const string& name = a.rest[0];
    auto main_recs = nav.load_symbol(name);
    optional<int> size_bytes;
    for (auto& r : main_recs)
        if (r.tag == "size") { try { size_bytes = std::stoi(r.body); } catch (...) {} }

    struct Member {
        string field;
        optional<int> bits;
        string type;
    };
    vector<Member> members;
    const string prefix = name + "..";
    for (auto& e : fs::directory_iterator(nav.refs_dir)) {
        if (!e.is_regular_file()) continue;
        string fn = e.path().filename().string();
        if (fn.rfind(prefix, 0) != 0) continue;
        string field = fn.substr(prefix.size());
        if (field.find("..") != string::npos) continue;  // nested: skip
        Member m{field, std::nullopt, ""};
        for (auto& r : parse_records(slurp(e.path()))) {
            if (r.tag == "offset") { try { m.bits = std::stoi(r.body); } catch (...) {} }
            else if (r.tag == "dec" || r.tag == "def") {
                if (auto t = r.attr("type")) m.type = *t;
            }
        }
        members.push_back(std::move(m));
    }
    std::sort(members.begin(), members.end(), [](const Member& A, const Member& B) {
        int oa = A.bits.value_or(INT_MAX), ob = B.bits.value_or(INT_MAX);
        return oa < ob;
    });
    if (members.empty()) {
        std::cerr << "no members found for " << name
                  << " (is it a struct/class/union?)\n";
        return 1;
    }
    if (a.json) {
        std::cout << "{\"name\":" << json_str(name);
        if (size_bytes) std::cout << ",\"size\":" << *size_bytes;
        std::cout << ",\"members\":[";
        for (size_t i = 0; i < members.size(); ++i) {
            if (i) std::cout << ",";
            auto& m = members[i];
            std::cout << "{\"field\":" << json_str(m.field)
                      << ",\"type\":" << json_str(m.type);
            if (m.bits) std::cout << ",\"bit_offset\":" << *m.bits
                                  << ",\"byte_offset\":" << (*m.bits / 8);
            std::cout << "}";
        }
        std::cout << "]}\n";
        return 0;
    }
    std::cout << name;
    if (size_bytes) std::cout << "   (size " << *size_bytes << " bytes)";
    std::cout << "\n";
    for (auto& m : members) {
        string off = "  ?  ";
        if (m.bits) {
            int bytes = *m.bits / 8, bits = *m.bits % 8;
            char buf[32];
            if (bits) std::snprintf(buf, sizeof(buf), "+%d.%d", bytes, bits);
            else      std::snprintf(buf, sizeof(buf), "+%d",    bytes);
            off = buf;
        }
        std::cout << "  " << off << "  " << m.field;
        if (!m.type.empty()) std::cout << "   [" << m.type << "]";
        std::cout << "\n";
    }
    return 0;
}

// ----- C++: hierarchy / overrides / members / resolve -------------------

// Inverse of sanitize_symbol for display: turn on-disk 'clang..PPCallbacks'
// back into 'clang::PPCallbacks'. codebrowser's sanitize is just ':' -> '.',
// so any '..' in a filename came from '::' in the original C++ name.
static string desanitize_for_display(const string& s) {
    string out;
    out.reserve(s.size());
    for (size_t i = 0; i < s.size(); ++i) {
        if (i + 1 < s.size() && s[i] == '.' && s[i + 1] == '.') {
            out += "::"; ++i;
        } else {
            out += s[i];
        }
    }
    return out;
}

// Resolve a ref token into a display-friendly form. Demangled names
// (Annotator::cache, std::exception) pass through unchanged. Itanium-mangled
// names (_Z...) are looked up in their own refs file and replaced by the
// type= attribute on their dec/def — that gives the full signature.
static string display_name_for_ref(const CodeNav& nav, const string& ref) {
    if (ref.size() < 2 || ref[0] != '_' || ref[1] != 'Z') return ref;
    for (auto& r : nav.load_symbol(ref)) {
        if (r.tag == "dec" || r.tag == "def") {
            if (auto t = r.attr("type")) return *t;
        }
    }
    return ref;  // fall through: leave the mangled form if we can't find it
}

// codebrowser sometimes only records half of an inheritance edge: a base may
// list its derived via <ovr c='Derived'/> while the derived lacks the matching
// <inh c='Base'/> in its own refs file (or vice versa). Scanning refs/* once
// and building reverse maps makes hierarchy/overrides symmetric regardless of
// which side was recorded.
struct ReverseMaps {
    // inh_on[X]: symbols whose refs file contains <inh c='X'/> (X is a base
    //            of each entry — its derived set).
    std::map<string, vector<string>> inh_on;
    // ovr_on[X]: symbols whose refs file contains <ovr c='X'/> (X is a
    //            derived of each entry — its base set).
    std::map<string, vector<string>> ovr_on;
};
static ReverseMaps build_reverse_maps(const CodeNav& nav) {
    ReverseMaps rm;
    for (auto& e : fs::directory_iterator(nav.refs_dir)) {
        if (!e.is_regular_file()) continue;
        string sym = e.path().filename().string();
        string text = slurp(e.path());
        bool has_inh = text.find("<inh ") != string::npos;
        bool has_ovr = text.find("<ovr ") != string::npos;
        if (!has_inh && !has_ovr) continue;
        for (auto& r : parse_records(text)) {
            if (r.tag == "inh") {
                if (auto c = r.attr("c")) rm.inh_on[*c].push_back(sym);
            } else if (r.tag == "ovr") {
                if (auto c = r.attr("c")) rm.ovr_on[*c].push_back(sym);
            }
        }
    }
    return rm;
}

// "hierarchy CLASS": walk class relationships recorded in this class's own
// refs file — <inh> for parents (up) and <ovr> for derived (down) — unioned
// with the reverse maps so edges recorded on only one side are still found.
static int cmd_hierarchy(const CodeNav& nav, const Args& a) {
    if (a.rest.empty()) { std::cerr << "hierarchy: missing CLASS\n"; return 2; }
    const string& root = a.rest[0];
    string dir = "up";
    if (auto it = a.opts.find("direction"); it != a.opts.end()) dir = it->second;
    if (dir != "up" && dir != "down") {
        std::cerr << "hierarchy: --direction must be up|down\n"; return 2;
    }
    int max_depth = 5;
    if (auto it = a.opts.find("depth"); it != a.opts.end()) max_depth = std::stoi(it->second);

    auto rm = build_reverse_maps(nav);
    // Keys are in canonical (sanitized) form so that 'std::logic_error' and
    // 'std..logic_error' — the same symbol reached via different record
    // shapes — collapse into one node.
    string canon_root = sanitize_symbol(root);
    std::map<string, int> depth_of = {{canon_root, 0}};
    std::map<string, string> came_from;
    std::queue<string> q; q.push(canon_root);
    const string target_tag = (dir == "up") ? "inh" : "ovr";
    while (!q.empty()) {
        string node = q.front(); q.pop();
        int d = depth_of[node];
        if (d >= max_depth) continue;
        vector<string> neighbors;
        for (auto& r : nav.load_symbol(node)) {
            if (r.tag != target_tag) continue;
            if (auto c = r.attr("c")) neighbors.push_back(sanitize_symbol(*c));
        }
        const auto& rev = (dir == "up") ? rm.ovr_on : rm.inh_on;
        // Reverse maps key on the c='...' value as stored (typically display
        // form), so look up under both canonical and non-canonical forms.
        for (const string& key : {node, desanitize_for_display(node)}) {
            if (auto it = rev.find(key); it != rev.end())
                for (auto& p : it->second) neighbors.push_back(sanitize_symbol(p));
        }
        for (auto& c : neighbors) {
            if (depth_of.count(c)) continue;
            depth_of[c] = d + 1;
            came_from[c] = node;
            q.push(c);
        }
    }
    depth_of.erase(canon_root);
    if (a.json) {
        std::cout << "{\"root\":" << json_str(root)
                  << ",\"direction\":" << json_str(dir)
                  << ",\"nodes\":[";
        bool first = true;
        for (auto& [n, d] : depth_of) {
            if (!first) std::cout << ","; first = false;
            std::cout << "{\"name\":" << json_str(n)
                      << ",\"depth\":" << d
                      << ",\"parent\":" << json_str(came_from[n]) << "}";
        }
        std::cout << "]}\n";
        return 0;
    }
    if (depth_of.empty()) {
        std::cerr << "no " << (dir == "up" ? "parents" : "derived")
                  << " recorded for " << root << "\n";
        return 1;
    }
    vector<std::pair<string, int>> items(depth_of.begin(), depth_of.end());
    std::sort(items.begin(), items.end(), [](auto& A, auto& B) {
        if (A.second != B.second) return A.second < B.second;
        return A.first < B.first;
    });
    std::cout << desanitize_for_display(canon_root) << "\n";
    for (auto& [n, d] : items)
        std::cout << string(d * 2, ' ') << "  " << desanitize_for_display(n)
                  << "   (from " << desanitize_for_display(came_from[n]) << ")\n";
    std::cerr << "-- " << items.size() << " "
              << (dir == "up" ? "base(s) upward" : "derived downward")
              << " from " << root << "\n";
    return 0;
}

// "overrides METHOD": the two-hop view — which methods does this one
// override (bases, via <inh>), and which methods override it (derived, via
// <ovr>). Critical for reasoning about virtual dispatch and indirect reach.
static int cmd_overrides(const CodeNav& nav, const Args& a) {
    if (a.rest.empty()) { std::cerr << "overrides: missing METHOD\n"; return 2; }
    const string& m = a.rest[0];
    auto recs = nav.load_symbol(m);
    if (recs.empty()) { std::cerr << "no data for: " << m << "\n"; return 1; }
    vector<string> bases, derived;
    for (auto& r : recs) {
        if (r.tag == "inh") { if (auto c = r.attr("c")) bases.push_back(*c); }
        else if (r.tag == "ovr") { if (auto c = r.attr("c")) derived.push_back(*c); }
    }
    // Bring in the reverse-recorded half: <ovr c='m'/> in some refs/B means B
    // is a base of m; <inh c='m'/> in some refs/D means D is a derived of m.
    // Look up under both the sanitized key and the display-form key because
    // c='...' attributes are stored as typed by the class/method author.
    auto rm = build_reverse_maps(nav);
    for (const string& key : {sanitize_symbol(m), desanitize_for_display(m), m}) {
        if (auto it = rm.ovr_on.find(key); it != rm.ovr_on.end())
            bases.insert(bases.end(), it->second.begin(), it->second.end());
        if (auto it = rm.inh_on.find(key); it != rm.inh_on.end())
            derived.insert(derived.end(), it->second.begin(), it->second.end());
    }
    // Dedup via canonical form so display-form and sanitized-form duplicates
    // for the same symbol collapse.
    auto uniq = [](vector<string>& v) {
        std::set<string> seen; vector<string> out;
        for (auto& x : v) {
            string k = sanitize_symbol(x);
            if (seen.insert(k).second) out.push_back(x);
        }
        v = std::move(out);
    };
    uniq(bases); uniq(derived);
    if (a.json) {
        std::cout << "{\"method\":" << json_str(m) << ",\"overrides\":[";
        for (size_t i = 0; i < bases.size(); ++i) {
            if (i) std::cout << ",";
            std::cout << "{\"ref\":" << json_str(bases[i])
                      << ",\"display\":" << json_str(display_name_for_ref(nav, bases[i]))
                      << "}";
        }
        std::cout << "],\"overridden_by\":[";
        for (size_t i = 0; i < derived.size(); ++i) {
            if (i) std::cout << ",";
            std::cout << "{\"ref\":" << json_str(derived[i])
                      << ",\"display\":" << json_str(display_name_for_ref(nav, derived[i]))
                      << "}";
        }
        std::cout << "]}\n";
        return 0;
    }
    if (bases.empty() && derived.empty()) {
        std::cerr << "no inheritance relationships for " << m << "\n"; return 1;
    }
    if (!bases.empty()) {
        std::cout << "overrides (" << bases.size() << "):\n";
        for (auto& b : bases)
            std::cout << "  " << desanitize_for_display(display_name_for_ref(nav, b)) << "\n";
    }
    if (!derived.empty()) {
        std::cout << "overridden by (" << derived.size() << "):\n";
        for (auto& d : derived)
            std::cout << "  " << desanitize_for_display(display_name_for_ref(nav, d)) << "\n";
    }
    return 0;
}

// "members CLASS": rich C++-aware view of a class/struct. Beyond the
// positional `struct` command this surfaces <inh> (bases), <mbr> (data
// members, inline in refs/CLASS — for C++ classes members live there rather
// than at refs/CLASS..field), <smbr> (static members), and <fun> (member
// functions, whose `r=` is usually Itanium-mangled).
static int cmd_members(const CodeNav& nav, const Args& a) {
    if (a.rest.empty()) { std::cerr << "members: missing CLASS\n"; return 2; }
    const string& cls = a.rest[0];
    auto recs = nav.load_symbol(cls);
    if (recs.empty()) { std::cerr << "no data for: " << cls << "\n"; return 1; }

    optional<int> size_bytes;
    vector<string> bases;
    struct Field { string name; optional<int> bits; string type; };
    vector<Field> fields;
    vector<std::pair<string, string>> statics;
    vector<string> method_refs;
    for (auto& r : recs) {
        if (r.tag == "size") {
            try { size_bytes = std::stoi(r.body); } catch (...) {}
        } else if (r.tag == "inh") {
            if (auto c = r.attr("c")) bases.push_back(*c);
        } else if (r.tag == "mbr") {
            Field f;
            if (auto n = r.attr("r")) f.name = *n;
            if (auto o = r.attr("o")) { try { f.bits = std::stoi(*o); } catch (...) {} }
            if (auto t = r.attr("t")) f.type = *t;
            fields.push_back(std::move(f));
        } else if (r.tag == "smbr") {
            string n, t;
            if (auto x = r.attr("r")) n = *x;
            if (auto x = r.attr("t")) t = *x;
            statics.emplace_back(n, t);
        } else if (r.tag == "fun") {
            if (auto x = r.attr("r")) method_refs.push_back(*x);
        }
    }
    std::sort(fields.begin(), fields.end(), [](const Field& A, const Field& B) {
        return A.bits.value_or(INT_MAX) < B.bits.value_or(INT_MAX);
    });
    vector<string> methods;
    methods.reserve(method_refs.size());
    for (auto& r : method_refs) methods.push_back(display_name_for_ref(nav, r));
    std::sort(methods.begin(), methods.end());
    std::sort(statics.begin(), statics.end());
    std::sort(bases.begin(), bases.end());

    if (a.json) {
        std::cout << "{\"class\":" << json_str(cls);
        if (size_bytes) std::cout << ",\"size\":" << *size_bytes;
        std::cout << ",\"bases\":[";
        for (size_t i = 0; i < bases.size(); ++i) {
            if (i) std::cout << ","; std::cout << json_str(bases[i]);
        }
        std::cout << "],\"fields\":[";
        for (size_t i = 0; i < fields.size(); ++i) {
            if (i) std::cout << ",";
            std::cout << "{\"name\":" << json_str(fields[i].name)
                      << ",\"type\":" << json_str(fields[i].type);
            if (fields[i].bits) std::cout << ",\"bit_offset\":" << *fields[i].bits
                                          << ",\"byte_offset\":" << (*fields[i].bits / 8);
            std::cout << "}";
        }
        std::cout << "],\"static\":[";
        for (size_t i = 0; i < statics.size(); ++i) {
            if (i) std::cout << ",";
            std::cout << "{\"name\":" << json_str(statics[i].first)
                      << ",\"type\":" << json_str(statics[i].second) << "}";
        }
        std::cout << "],\"methods\":[";
        for (size_t i = 0; i < methods.size(); ++i) {
            if (i) std::cout << ","; std::cout << json_str(methods[i]);
        }
        std::cout << "]}\n";
        return 0;
    }
    std::cout << "class " << cls;
    if (size_bytes) std::cout << "   (" << *size_bytes << " bytes)";
    std::cout << "\n";
    if (!bases.empty()) {
        std::cout << "  bases (" << bases.size() << "):\n";
        for (auto& b : bases) std::cout << "    " << b << "\n";
    }
    if (!fields.empty()) {
        std::cout << "  fields (" << fields.size() << "):\n";
        for (auto& f : fields) {
            string off = " +?";
            if (f.bits) {
                int b = *f.bits;
                char buf[32];
                if (b % 8) std::snprintf(buf, sizeof(buf), "+%d.%d", b / 8, b % 8);
                else       std::snprintf(buf, sizeof(buf), "+%d",    b / 8);
                off = buf;
            }
            std::cout << "    " << off << "  " << f.name;
            if (!f.type.empty()) std::cout << "   [" << f.type << "]";
            std::cout << "\n";
        }
    }
    if (!statics.empty()) {
        std::cout << "  static (" << statics.size() << "):\n";
        for (auto& [n, t] : statics) {
            std::cout << "    " << n;
            if (!t.empty()) std::cout << "   [" << t << "]";
            std::cout << "\n";
        }
    }
    if (!methods.empty()) {
        std::cout << "  methods (" << methods.size() << "):\n";
        for (auto& m : methods) std::cout << "    " << m << "\n";
    }
    return 0;
}

// "resolve QUERY": map a display name (or substring) to the canonical on-disk
// refs name. Saves agents from hand-crafting mangled names or guessing how
// operators / namespaces / templates translate to filenames. Priority:
//   (1) exact display match, (2) prefix match, (3) substring. Within each
// tier results are returned in fnSearch's bucket order.
static int cmd_resolve(const CodeNav& nav, const Args& a) {
    if (a.rest.empty()) { std::cerr << "resolve: missing QUERY\n"; return 2; }
    const string& q = a.rest[0];
    int limit = 20;
    if (auto it = a.opts.find("limit"); it != a.opts.end()) limit = std::stoi(it->second);

    // If the query already names a refs file, that's our answer.
    if (nav.symbol_exists(q)) {
        string ref = sanitize_symbol(q);
        if (a.json) {
            std::cout << "[{\"ref\":" << json_str(ref)
                      << ",\"display\":" << json_str(q)
                      << ",\"match\":\"direct\"}]\n";
        } else {
            std::cout << ref << "\t" << q << "\tdirect\n";
        }
        return 0;
    }
    string lq = to_lower(q);
    vector<std::pair<string, string>> exact, prefix, contains;
    for (auto& e : fs::directory_iterator(nav.fnsearch_dir)) {
        string text = slurp(e.path());
        size_t start = 0;
        while (start < text.size()) {
            size_t nl = text.find('\n', start);
            string_view line(text.data() + start,
                             (nl == string::npos ? text.size() : nl) - start);
            auto bar = line.find('|');
            if (bar != string_view::npos) {
                string ref(line.substr(0, bar));
                string name(line.substr(bar + 1));
                string ln = to_lower(name);
                if (ln == lq)                        exact.emplace_back(ref, name);
                else if (ln.rfind(lq, 0) == 0)       prefix.emplace_back(ref, name);
                else if (ln.find(lq) != string::npos) contains.emplace_back(ref, name);
            }
            if (nl == string::npos) break;
            start = nl + 1;
        }
    }
    auto pick = [&](auto& vec, const char* label) {
        for (auto& p : vec) {
            if (a.json) {} // caller handles batching
            (void)label;
        }
    };
    (void)pick;
    vector<std::tuple<string, string, string>> out;  // ref, name, tier
    for (auto& p : exact)    { out.emplace_back(p.first, p.second, "exact"); if ((int)out.size() >= limit) break; }
    for (auto& p : prefix)   { if ((int)out.size() >= limit) break; out.emplace_back(p.first, p.second, "prefix"); }
    for (auto& p : contains) { if ((int)out.size() >= limit) break; out.emplace_back(p.first, p.second, "contains"); }
    // Fallback: scan refs/ for a dec/def whose type= contains the query.
    // This catches symbols codebrowser didn't write to fnSearch (e.g. virtual
    // methods defined in system headers where only override points are indexed).
    if (out.empty()) {
        for (auto& e : fs::directory_iterator(nav.refs_dir)) {
            if (!e.is_regular_file()) continue;
            string text = slurp(e.path());
            if (text.find(q) == string::npos) continue;  // cheap prefilter
            for (auto& r : parse_records(text)) {
                if (r.tag != "dec" && r.tag != "def") continue;
                auto t = r.attr("type"); if (!t) continue;
                if (t->find(q) != string::npos) {
                    out.emplace_back(e.path().filename().string(), *t, "signature");
                    break;
                }
            }
            if ((int)out.size() >= limit) break;
        }
    }
    if (out.empty()) {
        std::cerr << "no symbol matches: " << q << "\n";
        return 1;
    }
    if (a.json) {
        std::cout << "[";
        for (size_t i = 0; i < out.size(); ++i) {
            if (i) std::cout << ",";
            auto& [ref, name, tier] = out[i];
            std::cout << "{\"ref\":" << json_str(ref)
                      << ",\"display\":" << json_str(name)
                      << ",\"match\":" << json_str(tier) << "}";
        }
        std::cout << "]\n";
    } else {
        for (auto& [ref, name, tier] : out)
            std::cout << ref << "\t" << name << "\t" << tier << "\n";
    }
    return 0;
}

// ----- main --------------------------------------------------------------

int main(int argc, char** argv) {
    Args a = parse_args(argc, argv);
    if (a.cmd.empty()) { usage(); return 2; }
    if (a.data_dir.empty()) {
        std::cerr << "error: -d/--data-dir or $CODENAV_DATA required\n";
        return 2;
    }
    optional<fs::path> src;
    if (!a.src_root.empty()) src = fs::path(a.src_root);
    CodeNav nav(a.data_dir, src);

    using Cmd = int (*)(const CodeNav&, const Args&);
    static const std::map<string, Cmd> cmds = {
        {"show", cmd_show},    {"refs", cmd_refs},     {"def", cmd_def},
        {"info", cmd_info},    {"search", cmd_search}, {"symbols", cmd_symbols},
        {"at", cmd_at},        {"callers", cmd_callers},{"callees", cmd_callees},
        {"files", cmd_files},
        {"enclosing", cmd_enclosing}, {"callpath", cmd_callpath},
        {"reachable", cmd_reachable}, {"body", cmd_body},
        {"struct", cmd_struct},
        {"hierarchy", cmd_hierarchy}, {"overrides", cmd_overrides},
        {"members", cmd_members},     {"resolve", cmd_resolve},
    };
    auto it = cmds.find(a.cmd);
    if (it == cmds.end()) { std::cerr << "unknown command: " << a.cmd << "\n"; return 2; }
    return it->second(nav, a);
}

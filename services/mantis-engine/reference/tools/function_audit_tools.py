# Copyright 2026 Nightfall Contributors
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     https://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

"""Per-symbol intent-vs-implementation audit ledger (`fnaudit`) and C/C++
semantic code navigation (`codenav`) tools for Mantis.

Backed by:
  - `third_party/fnaudit` (Apache-2.0, pinned commit 686c309a04de): durable
    SQLite + FTS5 per-symbol audit store anchored by SHA-256 `body_sha` of the
    exact scanned source span.
  - `vendor/codenav` (Apache-2.0, pinned commit 670a3f3ca515): C++20 semantic
    query binary over KDAB Woboq / compile_commands datasets when present,
    degrading cleanly to Mantis's tree-sitter `StructuralIndex` tools otherwise.
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import re
import subprocess
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from core.context import current_run_context
from core.llm_gateway import wrap_untrusted_content
from core.paths import resolve_db_path
from core.structural_index import (
    StructuralIndex,
    resolve_state_dir_for_target,
    state_dir_for_db,
)
from core.truncation import split_truncation
from third_party.fnaudit import db as fnaudit_db

logger = logging.getLogger(__name__)

MAX_CODENAV_BYTES = 32_768
MAX_BRIEFING_CHARS = 3_200
_SEVERITY_RANK = {"critical": 4, "high": 3, "medium": 2, "low": 1, "info": 0, "informational": 0}
_ALLOWED_CODENAV_COMMANDS = frozenset({
    "show",
    "refs",
    "def",
    "info",
    "search",
    "symbols",
    "at",
    "callers",
    "callees",
    "files",
    "enclosing",
    "callpath",
    "reachable",
    "body",
    "struct",
    "hierarchy",
    "overrides",
    "members",
    "resolve",
})
_SAFE_SLUG = re.compile(r"[^A-Za-z0-9_.-]+")


def _clean_rel_path(filepath: str) -> str:
    return (filepath or "").strip().replace("\\", "/").removeprefix("./")


def _active_target_root(ctx: Any) -> str:
    if ctx is None:
        return ""
    for attr in ("path_root", "jail_dir", "target_file"):
        raw = str(getattr(ctx, attr, "") or "").strip()
        if raw and os.path.exists(raw):
            real = os.path.realpath(raw)
            return os.path.dirname(real) if os.path.isfile(real) else real
    return ""


def _resolve_state_dir(ctx: Any) -> Optional[Path]:
    if ctx is None or not getattr(ctx, "db_path", None):
        return None
    resolved_db = resolve_db_path(ctx.db_path)
    active_root = _active_target_root(ctx)
    snap = str(getattr(ctx, "snapshot_id", "") or "")
    if active_root:
        state_dir = resolve_state_dir_for_target(resolved_db, active_root, snapshot_id=snap)
    else:
        state_dir = state_dir_for_db(resolved_db)
    if not state_dir:
        state_dir = os.path.join(os.path.dirname(os.path.abspath(resolved_db)), "state")
    p = Path(state_dir)
    p.mkdir(parents=True, exist_ok=True)
    return p


def _fnaudit_db_path(ctx: Any) -> Optional[Path]:
    state_dir = _resolve_state_dir(ctx)
    if state_dir is None:
        return None
    return state_dir / "fnaudit.db"


def _open_fnaudit_conn(ctx: Any):
    db_file = _fnaudit_db_path(ctx)
    if db_file is None:
        return None, "Error: No active execution context with a campaign database."
    conn = fnaudit_db.connect(db_file, must_exist=False)
    fnaudit_db.init_schema(conn, codebase=_active_target_root(ctx) or None)
    return conn, None


async def _read_verified_span(
    ctx: Any, filepath: str, line_start: int, line_end: int
) -> Tuple[Optional[str], Optional[str]]:
    """Reads `filepath` lines `[line_start..line_end]` through `ctx.sandbox`, enforcing jail bounds."""
    clean = _clean_rel_path(filepath)
    if not clean or clean.startswith("/") or ".." in Path(clean).parts:
        return None, f"Error: filepath '{filepath}' must be a relative path inside the scan root."
    if line_start < 1 or line_end < line_start:
        return None, f"Error: invalid line span {line_start}-{line_end}."

    if ctx.target_file and os.path.isfile(ctx.target_file) and ctx.jail_dir:
        if (
            len(getattr(ctx, "group_targets", ()) or ()) <= 1
            and getattr(ctx, "scan_mode", "") != "cross-functional"
        ):
            req_target = os.path.realpath(os.path.join(ctx.jail_dir, clean))
            real_target = os.path.realpath(ctx.target_file)
            if os.path.exists(req_target) and req_target != real_target:
                return (
                    None,
                    f"Error: Permission denied. Single-file scans may only read '{os.path.basename(real_target)}'.",
                )

    sandbox = getattr(ctx, "sandbox", None)
    if sandbox is None or not hasattr(sandbox, "read_file"):
        target = getattr(ctx, "jail_dir", None) or getattr(ctx, "target_file", None) or ""
        if not target:
            return None, "Error: No scan target configured in execution context."
        from core.environments.static_env import StaticOnlyEnvironment

        sandbox = StaticOnlyEnvironment(target_path=target)

    try:
        raw_bytes = await sandbox.read_file(Path(clean))
    except Exception as exc:
        return None, f"Error: unable to read '{clean}' inside scan target: {exc}"

    text = raw_bytes.decode("utf-8", errors="replace")
    lines = text.splitlines()
    if line_end > len(lines):
        return (
            None,
            f"Error: line_end={line_end} exceeds '{clean}' length ({len(lines)} line(s)).",
        )
    span_text = "\n".join(lines[line_start - 1 : line_end])
    body_sha = hashlib.sha256(span_text.encode("utf-8")).hexdigest()
    return body_sha, None


def _extract_body_sha(entry: Dict[str, Any]) -> Optional[str]:
    sample = entry.get("callers_sample")
    if isinstance(sample, list):
        for item in sample:
            if isinstance(item, str) and item.startswith("body_sha:"):
                return item.split(":", 1)[1]
    return None


async def record_function_audit(
    symbol_qualified: str,
    filepath: str,
    line_start: int,
    line_end: int,
    intent: str,
    issues_json: str = "[]",
    signature: str = "",
    preconditions: str = "",
    postconditions: str = "",
    reasoning_trace: str = "",
) -> str:
    """Records a body_sha-anchored intent-vs-implementation audit for one function in fnaudit.db."""
    if not isinstance(symbol_qualified, str) or not symbol_qualified.strip():
        return "Error: symbol_qualified must be a non-empty string."
    if not isinstance(filepath, str) or not filepath.strip():
        return "Error: filepath must be a non-empty string."
    if not isinstance(intent, str) or not intent.strip():
        return "Error: intent must describe what the function is intended to do."
    try:
        start_ln = int(line_start)
        end_ln = int(line_end)
    except (TypeError, ValueError):
        return "Error: line_start and line_end must be positive integers."

    ctx = current_run_context.get()
    if ctx is None:
        return "Error: No active execution context."

    body_sha, span_err = await _read_verified_span(ctx, filepath, start_ln, end_ln)
    if span_err or not body_sha:
        return span_err or "Error: failed to compute body_sha."

    try:
        parsed_issues = json.loads(issues_json or "[]") if isinstance(issues_json, str) else issues_json
    except json.JSONDecodeError as exc:
        return f"Error: issues_json is not valid JSON: {exc}"
    if not isinstance(parsed_issues, list):
        return "Error: issues_json must decode to a JSON array of issue objects."

    normalized_issues: List[Dict[str, Any]] = []
    for item in parsed_issues:
        if not isinstance(item, dict):
            continue
        sev = str(item.get("severity") or "info").strip().lower()
        if sev not in _SEVERITY_RANK:
            sev = "medium"
        normalized_issues.append({
            "severity": "info" if sev == "informational" else sev,
            "category": str(item.get("category") or "logic").strip(),
            "description": str(item.get("description") or "").strip(),
            "site": str(item.get("site") or f"{_clean_rel_path(filepath)}:{start_ln}-{end_ln}").strip(),
            "verification_status": "theoretical",
        })

    clean_file = _clean_rel_path(filepath)
    effective_sig = (signature or "").strip() or f"{symbol_qualified.strip()}@{clean_file}:{start_ln}"
    state_dir = _resolve_state_dir(ctx)
    trace_rel: Optional[str] = None
    if isinstance(reasoning_trace, str) and reasoning_trace.strip() and state_dir is not None:
        traces_dir = state_dir / "fnaudit_traces"
        traces_dir.mkdir(parents=True, exist_ok=True)
        slug = _SAFE_SLUG.sub("_", f"{symbol_qualified.strip()}_{body_sha[:12]}").strip("_")[:120]
        trace_file = traces_dir / f"{slug}.trace.md"
        trace_file.write_text(reasoning_trace.strip() + "\n", encoding="utf-8")
        trace_rel = str(trace_file.name)

    anchors = [f"body_sha:{body_sha}"]
    if trace_rel:
        anchors.append(f"trace:{trace_rel}")

    conn, conn_err = _open_fnaudit_conn(ctx)
    if conn is None:
        return conn_err or "Error: unable to open fnaudit database."
    try:
        entry = {
            "symbol_qualified": symbol_qualified.strip(),
            "signature": effective_sig,
            "file_path": clean_file,
            "line_start": start_ln,
            "line_end": end_ln,
            "intent": intent.strip(),
            "issues": normalized_issues,
            "preconditions": (preconditions or "").strip() or None,
            "postconditions": (postconditions or "").strip() or None,
            "callers_sample": anchors,
            "reviewer": f"mantis/{getattr(ctx, 'run_id', 'local')}",
            "source_commit": str(getattr(ctx, "snapshot_id", "") or "") or None,
        }
        with conn:
            action, content_hash = fnaudit_db.upsert_audit(conn, entry)
    finally:
        conn.close()

    return json.dumps({
        "status": "ok",
        "action": action,
        "symbol_qualified": symbol_qualified.strip(),
        "file_path": clean_file,
        "line_range": [start_ln, end_ln],
        "body_sha": body_sha,
        "content_hash": content_hash,
        "issues_recorded": len(normalized_issues),
        "trace_artifact": trace_rel,
    })


async def get_function_audit(
    symbol: str = "",
    query: str = "",
    filepath: str = "",
    limit: int = 10,
) -> str:
    """Looks up recorded function audits by symbol, filepath, or FTS5 query and checks body_sha freshness."""
    ctx = current_run_context.get()
    if ctx is None:
        return "Error: No active execution context."

    db_file = _fnaudit_db_path(ctx)
    if db_file is None or not db_file.is_file():
        return "No function audits recorded yet in this workspace."

    capped_limit = max(1, min(50, int(limit or 10)))
    clean_file = _clean_rel_path(filepath) if filepath else None

    conn = fnaudit_db.connect(db_file, must_exist=True)
    try:
        if isinstance(symbol, str) and symbol.strip():
            rows = fnaudit_db.lookup(conn, symbol.strip(), file_path=clean_file)[:capped_limit]
        elif isinstance(query, str) and query.strip():
            rows = fnaudit_db.fts_search(conn, query.strip(), limit=capped_limit)
        else:
            rows = fnaudit_db.list_entries(conn, file_path=clean_file, limit=capped_limit)
    except Exception as exc:
        return f"Error querying fnaudit database: {exc}"
    finally:
        conn.close()

    if not rows:
        return "No matching function audit entries found."

    enriched: List[Dict[str, Any]] = []
    for row in rows:
        recorded_sha = _extract_body_sha(row)
        body_stale = False
        if recorded_sha and row.get("file_path") and row.get("line_start") and row.get("line_end"):
            current_sha, err = await _read_verified_span(
                ctx, str(row["file_path"]), int(row["line_start"]), int(row["line_end"])
            )
            if err or current_sha != recorded_sha:
                body_stale = True
        enriched.append({
            "symbol_qualified": row.get("symbol_qualified"),
            "file_path": row.get("file_path"),
            "line_start": row.get("line_start"),
            "line_end": row.get("line_end"),
            "body_sha": recorded_sha,
            "body_stale": body_stale,
            "intent": row.get("intent"),
            "issues": row.get("issues") or [],
            "preconditions": row.get("preconditions"),
            "postconditions": row.get("postconditions"),
        })

    payload = json.dumps(enriched, ensure_ascii=False, indent=2)
    payload, cut = split_truncation(payload, MAX_CODENAV_BYTES, what="fnaudit lookup results")
    return wrap_untrusted_content(payload, filename="fnaudit.db") + cut


def _caller_count_from_index(ctx: Any, symbol: str, filepath: str) -> Optional[int]:
    try:
        state_dir = _resolve_state_dir(ctx)
        if state_dir is None:
            return None
        idx = StructuralIndex(str(state_dir))
        if not idx.available():
            return None
        resolved = idx.resolve_symbol(symbol, limit=5, filepath=filepath)
        results = resolved.get("results") or []
        if not results:
            return None
        callers = idx.find_callers(results[0], limit=1, offset=0)
        return int(callers.get("total") or 0)
    except Exception:
        return None


async def summarize_function_audits(file_prefix: str = "", top_n: int = 10) -> str:
    """Renders a compact (<= ~800 token) ranked audit briefing across audited functions."""
    ctx = current_run_context.get()
    if ctx is None:
        return "Error: No active execution context."

    db_file = _fnaudit_db_path(ctx)
    if db_file is None or not db_file.is_file():
        return "No function audits recorded yet in fnaudit.db."

    prefix = _clean_rel_path(file_prefix) if file_prefix else None
    capped_top = max(1, min(25, int(top_n or 10)))

    conn = fnaudit_db.connect(db_file, must_exist=True)
    try:
        rows = fnaudit_db.list_entries(conn, file_prefix=prefix or None)
    finally:
        conn.close()

    if not rows:
        scope = f" under '{prefix}'" if prefix else ""
        return f"No audited symbols recorded{scope}."

    scored: List[Dict[str, Any]] = []
    sev_totals = {"critical": 0, "high": 0, "medium": 0, "low": 0, "info": 0}
    for row in rows:
        issues = row.get("issues") if isinstance(row.get("issues"), list) else []
        best_sev = "info"
        lead = ""
        cats: List[str] = []
        for issue in issues:
            if not isinstance(issue, dict):
                continue
            s = str(issue.get("severity") or "info").lower()
            if s == "informational":
                s = "info"
            if _SEVERITY_RANK.get(s, 0) > _SEVERITY_RANK.get(best_sev, 0):
                best_sev = s
            if not lead and issue.get("description"):
                lead = str(issue["description"]).splitlines()[0][:120]
            if issue.get("category"):
                cats.append(str(issue["category"]))
        sev_totals[best_sev] = sev_totals.get(best_sev, 0) + 1
        sym = str(row.get("symbol_qualified") or "")
        fp = str(row.get("file_path") or "")
        callers = _caller_count_from_index(ctx, sym, fp)
        scored.append({
            "sym": sym,
            "loc": f"{fp}:{row.get('line_start')}",
            "sev": best_sev,
            "issue_count": len(issues),
            "callers": callers,
            "cats": sorted(set(cats))[:3],
            "lead": lead or str(row.get("intent") or "")[:100],
        })

    scored.sort(
        key=lambda x: (
            _SEVERITY_RANK.get(x["sev"], 0),
            x["issue_count"],
            x["callers"] if x["callers"] is not None else -1,
        ),
        reverse=True,
    )

    scope_title = prefix or "workspace"
    lines = [
        f"# Function Audit Briefing ({scope_title})",
        (
            f"Audited symbols: {len(scored)} | "
            + ", ".join(f"{sev_totals[k]} {k}" for k in ("critical", "high", "medium", "low", "info"))
        ),
        "",
        f"## Top {min(capped_top, len(scored))} Leads (severity x fan-in)",
        "| # | Symbol | Sev | Callers | Categories | Lead |",
        "|---|--------|-----|---------|------------|------|",
    ]
    for idx_num, item in enumerate(scored[:capped_top], start=1):
        callers_str = str(item["callers"]) if item["callers"] is not None else "?"
        cats_str = ", ".join(item["cats"]) if item["cats"] else "-"
        lines.append(
            f"| {idx_num} | `{item['sym']}` ({item['loc']}) | {item['sev']} | {callers_str} | {cats_str} | {item['lead']} |"
        )

    briefing = "\n".join(lines)
    if len(briefing) > MAX_BRIEFING_CHARS:
        briefing = briefing[:MAX_BRIEFING_CHARS] + "\n...[truncated to 800-token briefing budget]"
    return wrap_untrusted_content(briefing, filename="fnaudit_summary")


def resolve_codenav_binary() -> Optional[str]:
    candidates = [
        os.environ.get("NIGHTFALL_CODENAV_BIN", "").strip(),
        os.path.join(os.path.expanduser("~"), ".local", "share", "nightfall", "codenav", "bin", "codenav"),
        str(Path(__file__).resolve().parents[4] / "vendor" / "codenav" / "bin" / "codenav"),
    ]
    for cand in candidates:
        if cand and os.path.isfile(cand) and os.access(cand, os.X_OK):
            return cand
    return None


def _resolve_codenav_data_dir(ctx: Any, target_root: str) -> Optional[str]:
    env_dir = os.environ.get("CODENAV_DATA", "").strip()
    state_dir = _resolve_state_dir(ctx)
    candidates = [
        env_dir,
        str(state_dir / "codenav") if state_dir else "",
        os.path.join(target_root, ".codenav") if target_root else "",
        os.path.join(target_root, "nav", "codenav-db") if target_root else "",
    ]
    for cand in candidates:
        if cand and os.path.isdir(cand) and os.path.isdir(os.path.join(cand, "refs")):
            return cand
    return None


def codenav_query(command: str, target: str = "", extra_arg: str = "") -> str:
    """Runs a read-only C/C++ semantic query via vendored codenav when a codebrowser dataset exists."""
    cmd = (command or "").strip().lower()
    if cmd not in _ALLOWED_CODENAV_COMMANDS:
        return (
            f"Error: unsupported codenav command '{command}'. "
            f"Allowed: {', '.join(sorted(_ALLOWED_CODENAV_COMMANDS))}."
        )

    ctx = current_run_context.get()
    if ctx is None:
        return "Error: No active execution context."

    target_root = _active_target_root(ctx)
    if not target_root:
        return "Error: No active scan target directory."

    binary = resolve_codenav_binary()
    if not binary:
        return (
            "codenav binary is not built on this host. Use find_symbol, find_callers, "
            "find_callees, and get_function_boundary for tree-sitter navigation."
        )

    data_dir = _resolve_codenav_data_dir(ctx, target_root)
    if not data_dir:
        return (
            "No Woboq/codenav index dataset (refs/) found for this target. "
            "Fall back to find_symbol, find_callers, find_callees, and get_function_boundary."
        )

    for arg_val in (target, extra_arg):
        if arg_val and (".." in Path(arg_val).parts or arg_val.strip().startswith("-")):
            return f"Error: invalid codenav argument '{arg_val}'."

    argv = [binary, "-d", data_dir, "-s", target_root, cmd]
    if target and target.strip():
        argv.append(target.strip())
    if extra_arg and extra_arg.strip():
        argv.append(extra_arg.strip())

    try:
        proc = subprocess.run(
            argv,
            capture_output=True,
            text=True,
            timeout=15,
            check=False,
        )
    except Exception as exc:
        return f"Error executing codenav: {exc}"

    if proc.returncode != 0:
        err = (proc.stderr or proc.stdout or "").strip()[:400]
        return f"codenav {cmd} exited {proc.returncode}: {err}"

    output, cut_note = split_truncation(
        proc.stdout or "",
        MAX_CODENAV_BYTES,
        what=f"codenav {cmd} {target}".strip(),
    )
    return wrap_untrusted_content(output, filename="codenav") + cut_note

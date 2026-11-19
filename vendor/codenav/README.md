# codenav — Claude Code / OpenCode skill

A CLI and skill for semantic navigation of C/C++ codebases indexed by
[KDAB codebrowser](https://github.com/KDAB/codebrowser). Gives coding and
security-review agents: cross-references, call graphs, class hierarchies,
struct layouts, and virtual-override relationships.

## Install (Claude Code)

```bash
# User-level (available in all projects):
cp -r codenav-skill ~/.claude/skills/codenav

# Or project-level:
cp -r codenav-skill .claude/skills/codenav
```

Then restart Claude Code (or `/reload`). Test with:

> /codenav

…or ask "find all callers of `foo`" in a C/C++ project — Claude should auto-invoke.

## Install (OpenCode)

OpenCode follows the same skill directory convention. Drop the `codenav-skill/`
directory (renamed to `codenav/`) into your OpenCode skills path — typically
`~/.config/opencode/skills/codenav/` or the project-level equivalent — and
reload. The `SKILL.md` frontmatter is compatible.

## Prerequisites

- A C++20 compiler (`clang++` 19+ or `g++` 13+). The first skill invocation
  runs `make` to build `codenav` from `codenav.cpp`.
- [`codebrowser_generator`](https://github.com/KDAB/codebrowser) on `PATH`
  (or `$CODEBROWSER_GENERATOR`) for indexing new projects. Not needed if a
  codebrowser dataset already exists and is pointed at via `$CODENAV_DATA`.
- The target project must have a `compile_commands.json`. Generate with
  `cmake -DCMAKE_EXPORT_COMPILE_COMMANDS=ON`, `bear -- make`, or
  `compiledb -n make`.

## Manual CLI use (without Claude)

```bash
cd codenav-skill && make                              # build ./codenav
./index-project.sh /path/to/src /path/to/data         # index once
export CODENAV_DATA=/path/to/data CODENAV_SRC=/path/to/src
./codenav callers foo
./codenav hierarchy 'std::exception' --direction down
./codenav --help
```

## Files

| File | Purpose |
|---|---|
| `SKILL.md` | Skill definition: frontmatter + instructions to Claude. |
| `codenav.cpp` | Single-file C++20 source for the CLI. |
| `Makefile` | `make` produces `./codenav`. |
| `index-project.sh` | Helper: runs `codebrowser_generator` on a project tree. |

## Commands at a glance

**Core:** `show`, `refs`, `def`, `info`, `search`, `symbols`, `at`, `callers`, `callees`, `files`

**Callgraph / review:** `enclosing`, `callpath`, `reachable`, `body`, `struct`

**C++ specific:** `hierarchy`, `overrides`, `members`, `resolve`

Every command supports `--json` for machine-readable output. Run
`./codenav --help` or see `SKILL.md` for full reference and usage recipes.

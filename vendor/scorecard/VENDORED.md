# Vendored Upstream Provenance — Nightfall Scorecard Engine

- **Upstream Repository**: https://github.com/ossf/scorecard
- **Pinned Commit**: `6eb56f6a7e62d8f5d55800f54cd92ea305107d1d`
- **License**: Apache-2.0 (preserved in `./LICENSE`)
- **Nightfall Integration**:
  - Restyled default CLI and version output (`cmd/root.go`, `pkg/scorecard/nightfall.go`, `pkg/scorecard/scorecard_result.go`) to match Nightfall's deterministic key-value & aligned-column CLI aesthetic.
  - Added `--format=nightfall` (`AsNightfallJSON`) combining weighted check scores, embedded check risk/remediation metadata (`docs/checks`), and structured file/line probe findings + unified diff patches in a single pass.
  - Upgraded `nightfall-scorecard serve` (`cmd/serve.go`) to support local workspace directory scanning (`local`), `/scan`, `/checks` catalog introspection, structured `/health`, OSV client wiring, and ephemeral loopback port handshaking (`--listen 127.0.0.1:0`).
  - Enhanced `clients/localdir` & `pkg/scorecard` to skip ephemeral build/dependency caches (`node_modules`, `dist`, etc.) and resolve real Git `HEAD` revisions on local workspaces.

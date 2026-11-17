# Mantis engine in Nightfall

Mantis is an LLM-driven security review pipeline written in Python. It runs on
`reference/mantis_runtime`, a small in-house runtime (agents, workflow graph,
runner, sessions, LiteLLM adapter). It no longer depends on Google ADK.

## Setup

```sh
python3 -m venv .venv
.venv/bin/pip install --require-hashes -r services/mantis-engine/reference/requirements.txt
export NIGHTFALL_MANTIS_PYTHON=$PWD/.venv/bin/python
```

Model credentials are read from the environment, as Mantis always has
(see `reference/scripts/configure.py`).

## How Nightfall calls it

`MantisScanner` in `services/defense-factory/src/mantisScanner.ts` runs
`reference/nightfall_bridge.py` as a subprocess:

- `scanRepository({ repository, localPath })` runs a full Mantis review of a
  directory and returns `FindingRecord`s.
- `exportRun({ repository, dbPath, observedRevision, runId? })` reads a run
  already recorded in a Mantis database.

Mantis runs with `--sandbox static-only` by default, so dynamic proofs stay in
Nightfall's LiteBox `DisposableSandboxRuntime`.

Finding ids are `MANTIS-` plus a hash of repository, run and row, so exporting
the same run twice gives the same ids. Merged duplicates are left out.

## Tests

```sh
cd services/mantis-engine/reference && python scripts/run_unit_tests.py
pnpm vitest run services/defense-factory/src/mantisScanner.test.ts
```

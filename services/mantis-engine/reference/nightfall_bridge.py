#!/usr/bin/env python3
"""Nightfall bridge: run Mantis and hand its findings to Nightfall as JSON.

Two commands, both writing one JSON document to stdout:

  export  Read the findings of one Mantis run from its knowledge database.
  scan    Run the Mantis pipeline against a directory, then export that run.

Each finding is shaped like Nightfall's ``FindingRecord``
(packages/core-contracts/src/findings.ts) except ``owner``, which Nightfall
resolves from its own code-owner map. Merged duplicates are left out: their
content lives on in the finding they were merged into.
"""

from __future__ import annotations

import argparse
import datetime as _dt
import hashlib
import json
import os
import re
import sqlite3
import subprocess
import sys
from typing import Any, Iterable, Optional

_HERE = os.path.dirname(os.path.abspath(__file__))
if _HERE not in sys.path:
    sys.path.insert(0, _HERE)

EXPORT_FORMAT = "mantis-nightfall/v1"

_FALSE_POSITIVE = {"false_positive", "non_viable", "sample_or_test", "accepted_risk"}
_FIXED = {"patch_verified", "mitigated"}
_TRIAGED = {"confirmed", "viable", "static_confirmed", "reproduced", "dynamic_confirmed"}
_SKIPPED = {"duplicate_merged", "archived"}
_SEVERITIES = {"critical", "high", "medium", "low"}
_LOCATION = re.compile(r"^(?P<file>[^:]+):(?P<start>\d+)(?:-(?P<end>\d+))?(?::.*)?$")


def _severity(raw: Any) -> str:
    value = str(raw or "").strip().lower()
    if value in _SEVERITIES:
        return value
    if value in {"info", "informational", "none"}:
        return "informational"
    return "medium"


def _status(raw: Any) -> str:
    value = str(raw or "").strip().lower()
    if value in _FALSE_POSITIVE:
        return "discarded_fp"
    if value in _FIXED:
        return "fixed"
    if value in _TRIAGED:
        return "triaged"
    return "new"


def _fix_verification(status: str, patch_status: Any) -> str:
    if status == "patch_verified" or str(patch_status or "").upper() == "VERIFIED_SECURE":
        return "verified"
    if patch_status:
        return "verifying"
    return "not_recorded"


def _json_list(raw: Any) -> list[Any]:
    if isinstance(raw, list):
        return raw
    try:
        value = json.loads(raw or "[]")
    except (TypeError, ValueError):
        return []
    return value if isinstance(value, list) else []


def _positive_ints(values: Iterable[Any]) -> list[int]:
    out = []
    for v in values:
        try:
            n = int(v)
        except (TypeError, ValueError):
            continue
        if n > 0:
            out.append(n)
    return out


def _code_references(row: dict[str, Any]) -> list[dict[str, Any]]:
    refs: list[dict[str, Any]] = []
    seen: set[tuple[str, int, int]] = set()

    def add(file: str, start: int, end: int, description: str) -> None:
        key = (file, start, end)
        if file and key not in seen:
            seen.add(key)
            refs.append({"file": file, "startLine": start, "endLine": max(start, end), "description": description})

    lines = _positive_ints(_json_list(row.get("line_numbers")))
    if row.get("filepath") and lines:
        add(str(row["filepath"]), min(lines), max(lines), "Reported location")
    for entry in _json_list(row.get("code_paths")):
        m = _LOCATION.match(str(entry).strip())
        if m:
            start = int(m.group("start"))
            if start > 0:
                add(m.group("file"), start, int(m.group("end") or start), "Cited code path")
    return refs


def _iso(ts: Any) -> str:
    if not ts:
        return _dt.datetime.now(_dt.timezone.utc).isoformat().replace("+00:00", "Z")
    text = str(ts).strip().replace(" ", "T")
    return text if text.endswith("Z") or "+" in text[10:] else text + "Z"


def finding_id(repository: str, run_id: str, row_id: Any) -> str:
    digest = hashlib.sha256(f"{repository}\0{run_id}\0{row_id}".encode()).hexdigest()
    return f"MANTIS-{digest[:12].upper()}"


def to_finding_record(row: dict[str, Any], *, repository: str, revision: str) -> dict[str, Any]:
    """One Mantis finding row as a Nightfall FindingRecord (without ``owner``)."""
    run_id = str(row.get("run_id") or "")
    raw_status = str(row.get("status") or "reported").lower()
    fid = finding_id(repository, run_id, row.get("id"))
    description = str(row.get("description") or "").strip()
    title = str(row.get("title") or "").strip() or "Untitled Mantis finding"
    cwe = str(row.get("cwe") or "").strip()
    cluster_seed = row.get("lineage_id") or row.get("signature") or f"{cwe}:{row.get('filepath')}:{title}"
    sources = ["nightfall", "sast"]
    if raw_status in {"dynamic_confirmed", "reproduced", "patch_verified"}:
        sources.append("red-team")
    record: dict[str, Any] = {
        "id": fid,
        "title": title,
        "subtitle": f"{repository} · {fid} · Discovered by Mantis ({raw_status})",
        "repository": repository,
        "observedRevision": revision,
        "severity": _severity(row.get("severity")),
        "status": _status(raw_status),
        "fixVerification": _fix_verification(raw_status, row.get("patch_status")),
        "weaknessCwe": cwe,
        "sources": sources,
        "summary": description,
        "rootCause": str(row.get("rca_summary") or description),
        "impactAndAttackPath": str(row.get("triage_reasoning") or ""),
        "preconditions": [],
        "remediation": str(row.get("remediation") or ""),
        "codeReferences": _code_references(row),
        "rootCauseClusterKey": f"{repository}:mantis:{cluster_seed}",
        "createdAt": _iso(row.get("timestamp")),
        "updatedAt": _iso(row.get("timestamp")),
    }
    if row.get("triage_reasoning"):
        record["verificationChainSummary"] = str(row["triage_reasoning"])
    if row.get("patch_status"):
        record["defectsNotes"] = f"Mantis patch status: {row['patch_status']}"
    return record


def latest_run_id(db_path: str) -> Optional[str]:
    with sqlite3.connect(db_path) as conn:
        row = conn.execute(
            "SELECT run_id FROM findings WHERE run_id IS NOT NULL ORDER BY timestamp DESC, id DESC LIMIT 1"
        ).fetchone()
    return row[0] if row else None


def run_ids(db_path: str) -> set[str]:
    if not os.path.exists(db_path):
        return set()
    try:
        with sqlite3.connect(db_path) as conn:
            ids = {r[0] for r in conn.execute("SELECT DISTINCT run_id FROM findings WHERE run_id IS NOT NULL")}
            try:
                ids |= {r[0] for r in conn.execute("SELECT run_id FROM runs")}
            except sqlite3.OperationalError:
                pass
            return ids
    except sqlite3.DatabaseError:
        return set()


def export_run(db_path: str, *, repository: str, revision: str, run_id: Optional[str] = None) -> dict[str, Any]:
    if not os.path.exists(db_path):
        raise FileNotFoundError(f"Mantis database not found: {db_path}")
    rid = run_id or latest_run_id(db_path)
    findings: list[dict[str, Any]] = []
    if rid:
        with sqlite3.connect(db_path) as conn:
            conn.row_factory = sqlite3.Row
            rows = conn.execute(
                "SELECT * FROM findings WHERE run_id = ? ORDER BY id", (rid,)
            ).fetchall()
        for r in rows:
            row = dict(r)
            if str(row.get("status") or "").lower() in _SKIPPED or row.get("merged_into_id"):
                continue
            findings.append(to_finding_record(row, repository=repository, revision=revision))
    return {"format": EXPORT_FORMAT, "runId": rid, "repository": repository,
            "observedRevision": revision, "findings": findings}


def _cmd_export(args: argparse.Namespace) -> int:
    doc = export_run(args.db, repository=args.repository, revision=args.revision, run_id=args.run_id)
    json.dump(doc, sys.stdout)
    sys.stdout.write("\n")
    return 0


def _cmd_scan(args: argparse.Namespace) -> int:
    db_path = os.path.abspath(args.db)
    before = run_ids(db_path)
    argv = [sys.executable, os.path.join(_HERE, "main.py"), os.path.abspath(args.target),
            "--db", db_path, "--yes", *args.mantis_args]
    # Mantis's own progress goes to stderr so stdout carries only the export.
    proc = subprocess.run(argv, cwd=_HERE, stdout=sys.stderr, stderr=sys.stderr)
    new_runs = run_ids(db_path) - before
    run_id = sorted(new_runs)[-1] if len(new_runs) == 1 else (latest_run_id(db_path) if new_runs else None)
    doc = export_run(db_path, repository=args.repository, revision=args.revision, run_id=run_id) if run_id else {
        "format": EXPORT_FORMAT, "runId": None, "repository": args.repository,
        "observedRevision": args.revision, "findings": [],
    }
    doc["mantisExitCode"] = proc.returncode
    json.dump(doc, sys.stdout)
    sys.stdout.write("\n")
    # Exit 2 is Mantis pausing on a budget with findings saved: still a result.
    return 0 if proc.returncode in (0, 2) else proc.returncode


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Export Mantis findings for Nightfall.")
    sub = parser.add_subparsers(dest="command", required=True)
    for name in ("export", "scan"):
        p = sub.add_parser(name)
        p.add_argument("--db", required=True, help="Mantis knowledge database")
        p.add_argument("--repository", required=True, help="Repository name as Nightfall knows it")
        p.add_argument("--revision", required=True, help="Revision the findings were observed at")
        if name == "export":
            p.add_argument("--run-id", default=None, help="Run to export (default: the latest)")
            p.set_defaults(func=_cmd_export)
        else:
            p.add_argument("--target", required=True, help="Directory to scan")
            p.add_argument("mantis_args", nargs=argparse.REMAINDER,
                           help="Further Mantis options, after --")
            p.set_defaults(func=_cmd_scan)
    return parser


def main(argv: Optional[list[str]] = None) -> int:
    args = build_parser().parse_args(argv)
    if getattr(args, "mantis_args", None) and args.mantis_args[0] == "--":
        args.mantis_args = args.mantis_args[1:]
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())

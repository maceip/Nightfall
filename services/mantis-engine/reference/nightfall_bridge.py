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
import signal
import sqlite3
import subprocess
import sys
from typing import Any, Iterable, Optional

_HERE = os.path.dirname(os.path.abspath(__file__))
if _HERE not in sys.path:
    sys.path.insert(0, _HERE)

EXPORT_FORMAT = "mantis-nightfall/v1"

_FALSE_POSITIVE = {"false_positive", "non_viable", "sample_or_test", "accepted_risk"}
# Mantis's own proof and patch verdicts come from Mantis's sandbox, not from
# Nightfall's RedTeamEngine / LiteBox proof chain, so they never close a finding
# here: a "patched" or "verified" Mantis finding arrives triaged and pending.
_TRIAGED = {"confirmed", "viable", "static_confirmed", "reproduced", "dynamic_confirmed",
            "patch_verified", "mitigated"}
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
    if value in _TRIAGED:
        return "triaged"
    return "new"


def _fix_verification(status: str, patch_status: Any) -> str:
    """Mantis's verdict on a patch, which Nightfall still has to verify itself.

    A failed re-attack is surfaced as a regression; a Mantis "verified" patch
    stays pending (``verifying``) until Nightfall's own proof runs.
    """
    patch = str(patch_status or "").upper()
    if patch == "VERIFICATION_FAILED":
        return "regression_detected"
    if patch_status or status == "patch_verified":
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


def _root(path: str) -> str:
    return os.path.realpath(path).rstrip("/")


def run_target_root(db_path: str, run_id: str) -> Optional[str]:
    """The target directory a run recorded, or None for a run that recorded none."""
    try:
        with sqlite3.connect(db_path) as conn:
            row = conn.execute("SELECT metadata_json FROM runs WHERE run_id = ?", (run_id,)).fetchone()
    except sqlite3.OperationalError:
        return None
    try:
        meta = json.loads(row[0] or "{}") if row else {}
    except (TypeError, ValueError):
        return None
    root = meta.get("target_root") or meta.get("target") if isinstance(meta, dict) else None
    return _root(str(root)) if root else None


def latest_run_id(db_path: str, target: Optional[str] = None) -> Optional[str]:
    """The most recently started run, including one that found nothing.

    With ``target``, only runs over that directory count, so one database
    shared by several repositories never hands one repository another's run.
    """
    want = _root(target) if target else None
    with sqlite3.connect(db_path) as conn:
        try:
            rows = conn.execute("SELECT run_id, metadata_json FROM runs ORDER BY started DESC, rowid DESC").fetchall()
            for rid, meta_json in rows:
                if want is None:
                    return rid
                try:
                    meta = json.loads(meta_json or "{}")
                except (TypeError, ValueError):
                    meta = {}
                root = (meta.get("target_root") or meta.get("target")) if isinstance(meta, dict) else None
                if root and _root(str(root)) == want:
                    return rid
            if want is not None:
                return None
        except sqlite3.OperationalError:
            pass  # a database from before the runs table
        row = conn.execute(
            "SELECT run_id FROM findings WHERE run_id IS NOT NULL ORDER BY timestamp DESC, id DESC LIMIT 1"
        ).fetchone()
    return row[0] if row else None


class UnknownRunError(LookupError):
    pass


class NoRunError(LookupError):
    pass


class RunTargetMismatchError(LookupError):
    pass


class AmbiguousRunError(LookupError):
    pass


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


def export_run(db_path: str, *, repository: str, revision: str, run_id: Optional[str] = None,
               target: Optional[str] = None) -> dict[str, Any]:
    """One run's findings. With ``target``, the run must be a run over that directory."""
    if not os.path.exists(db_path):
        raise FileNotFoundError(f"Mantis database not found: {db_path}")
    if run_id and run_id not in run_ids(db_path):
        raise UnknownRunError(f"Mantis run not found in {db_path}: {run_id}")
    rid = run_id or latest_run_id(db_path, target)
    if not rid:
        scope = f" for {target}" if target else ""
        raise NoRunError(f"No Mantis run is recorded in {db_path}{scope}")
    if target:
        recorded = run_target_root(db_path, rid)
        if recorded is not None and recorded != _root(target):
            raise RunTargetMismatchError(f"Mantis run {rid} scanned {recorded}, not {_root(target)}")
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
    try:
        doc = export_run(args.db, repository=args.repository, revision=args.revision, run_id=args.run_id,
                         target=args.target)
    except (FileNotFoundError, UnknownRunError, NoRunError, RunTargetMismatchError) as err:
        print(str(err), file=sys.stderr)
        return 1
    json.dump(doc, sys.stdout)
    sys.stdout.write("\n")
    return 0


def _cmd_scan(args: argparse.Namespace) -> int:
    db_path = os.path.abspath(args.db)
    before = run_ids(db_path)
    resumed = _resume_target(args.mantis_args)
    if resumed == "":
        resumed = latest_run_id(db_path, args.target) if os.path.exists(db_path) else None
    resumed_before = _run_fingerprint(db_path, resumed)
    argv = [sys.executable, os.path.join(_HERE, "main.py"), os.path.abspath(args.target),
            "--db", db_path, "--yes", *args.mantis_args]
    # Mantis's own progress goes to stderr so stdout carries only the export.
    # It runs in its own process group, and a stop sent to the bridge stops the
    # whole scan, so a caller's timeout never leaves a scan spending in the background.
    proc = subprocess.Popen(argv, cwd=_HERE, stdout=sys.stderr, stderr=sys.stderr, start_new_session=True)

    def _stop(signum: int, _frame: Any) -> None:
        try:
            os.killpg(proc.pid, signal.SIGTERM)
        except ProcessLookupError:
            pass
        try:
            proc.wait(timeout=30)
        except subprocess.TimeoutExpired:
            os.killpg(proc.pid, signal.SIGKILL)
        sys.exit(128 + signum)

    for sig in (signal.SIGTERM, signal.SIGINT, signal.SIGHUP):
        signal.signal(sig, _stop)
    proc.wait()
    try:
        run_id = _scanned_run_id(db_path, before, args.mantis_args, args.target)
    except AmbiguousRunError as err:
        print(str(err), file=sys.stderr)
        return 1
    reused = run_id is not None and run_id in before
    untouched = run_id != resumed or resumed_before == _run_fingerprint(db_path, run_id)
    if reused and proc.returncode != 0 and untouched:
        # A resume Mantis refused before doing anything (a target or scan-mode
        # mismatch) left the old run as it was: its findings are not this scan's.
        print(f"Mantis exited {proc.returncode} without updating run {run_id}", file=sys.stderr)
        return proc.returncode
    if run_id is None:
        # Mantis recorded no run: a failure to start, never a clean result.
        print(f"Mantis recorded no run (exit code {proc.returncode})", file=sys.stderr)
        return proc.returncode or 1
    doc = export_run(db_path, repository=args.repository, revision=args.revision, run_id=run_id,
                     target=args.target)
    doc["mantisExitCode"] = proc.returncode
    json.dump(doc, sys.stdout)
    sys.stdout.write("\n")
    # A run that was recorded is a result, even when Mantis exits nonzero (a
    # budget pause, or one campaign failing while others saved findings): the
    # caller gets the findings with mantisExitCode and decides how to treat
    # incomplete coverage.
    return 0


def _run_fingerprint(db_path: str, run_id: Optional[str]) -> Optional[tuple[Any, ...]]:
    """What a run has recorded so far, to tell whether an invocation changed it."""
    if not run_id or not os.path.exists(db_path):
        return None
    try:
        with sqlite3.connect(db_path) as conn:
            parts: list[Any] = list(conn.execute(
                "SELECT COUNT(*), MAX(id), MAX(timestamp), GROUP_CONCAT(status) FROM findings WHERE run_id = ?",
                (run_id,)).fetchone())
            for table in ("runs", "campaign_spend"):
                try:
                    parts.append(conn.execute(f"SELECT COUNT(*), MAX(rowid) FROM {table} WHERE run_id = ?",
                                              (run_id,)).fetchone())
                except sqlite3.OperationalError:
                    parts.append(None)
            try:
                parts.append(conn.execute("SELECT metadata_json FROM runs WHERE run_id = ?", (run_id,)).fetchone())
            except sqlite3.OperationalError:
                parts.append(None)
            return tuple(parts)
    except sqlite3.DatabaseError:
        return None


def _resume_target(mantis_args: list[str]) -> Optional[str]:
    """The run named by --resume: its id, "" for "the latest", None without --resume.

    As with argparse, the last occurrence wins.
    """
    found: Optional[str] = None
    for i, arg in enumerate(mantis_args):
        if arg.startswith("--resume="):
            found = arg.split("=", 1)[1]
        elif arg == "--resume":
            nxt = mantis_args[i + 1] if i + 1 < len(mantis_args) else ""
            found = "" if not nxt or nxt.startswith("-") else nxt
    return found


def _scanned_run_id(db_path: str, before: set[str], mantis_args: list[str],
                    target: Optional[str] = None) -> Optional[str]:
    """The run this scan wrote: a new run, or the run it resumed."""
    new_runs = run_ids(db_path) - before
    if len(new_runs) > 1 and target:
        want = _root(target)
        new_runs = {r for r in new_runs if run_target_root(db_path, r) in (want, None)}
    if len(new_runs) == 1:
        return next(iter(new_runs))
    if new_runs:
        # Another scan of the same target wrote to this database at the same
        # time: there is no telling which run is ours, so this is a failure.
        raise AmbiguousRunError(
            f"Several new Mantis runs appeared in {db_path} during this scan: {sorted(new_runs)}; "
            "give concurrent scans separate databases")
    resumed = _resume_target(mantis_args)
    if resumed:
        return resumed if resumed in run_ids(db_path) else None
    if resumed == "":
        return latest_run_id(db_path, target)
    return None


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
            p.add_argument("--target", default=None,
                           help="Directory the run must have scanned (scopes 'latest' to it)")
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

from __future__ import annotations

import json
import sqlite3
from collections import defaultdict
from pathlib import Path
from typing import Any, Iterator

from .db import bulk_upsert, compute_content_hash, normalize_entry, row_to_entry
from .schema import AUDIT_COLUMNS


EXPORT_FIELDS = tuple(c for c in AUDIT_COLUMNS if c != "content_hash")


def iter_jsonl_tree(root: Path) -> Iterator[dict[str, Any]]:
    """Yield every JSON object from every *.jsonl file under `root`."""
    if not root.is_dir():
        raise FileNotFoundError(f"not a directory: {root}")
    for path in sorted(root.rglob("*.jsonl")):
        with path.open("r", encoding="utf-8") as fh:
            for lineno, raw in enumerate(fh, start=1):
                line = raw.strip()
                if not line:
                    continue
                try:
                    obj = json.loads(line)
                except json.JSONDecodeError as exc:
                    raise ValueError(f"{path}:{lineno}: invalid JSON: {exc}")
                if not isinstance(obj, dict):
                    raise ValueError(f"{path}:{lineno}: expected JSON object")
                yield obj


def build_from_jsonl(conn: sqlite3.Connection, root: Path) -> dict[str, int]:
    """Rebuild the audits table from a JSONL tree. Clears existing rows first."""
    with conn:
        conn.execute("DELETE FROM audits")
    return bulk_upsert(conn, iter_jsonl_tree(root))


def _entry_for_export(entry: dict[str, Any]) -> dict[str, Any]:
    out = {}
    for field in EXPORT_FIELDS:
        val = entry.get(field)
        if val is None:
            continue
        out[field] = val
    return out


def _entry_key(entry: dict[str, Any]) -> tuple:
    return (
        entry["symbol_qualified"],
        entry["signature"],
        entry["file_path"],
        entry["line_start"],
    )


def check_against_jsonl(
    conn: sqlite3.Connection,
    root: Path,
) -> dict[str, Any]:
    """Verify the DB matches the JSONL tree. Returns a diff report.

    The report has keys: 'ok' (bool), 'missing_in_db', 'missing_in_jsonl', 'content_diff'.
    Each list contains the (symbol_qualified, signature, file_path, line_start) keys of offending entries.
    """
    jsonl_hashes: dict[tuple, str] = {}
    for obj in iter_jsonl_tree(root):
        entry = normalize_entry(obj)
        jsonl_hashes[_entry_key(entry)] = compute_content_hash(entry)

    db_hashes: dict[tuple, str] = {}
    for r in conn.execute(
        "SELECT symbol_qualified, signature, file_path, line_start, content_hash FROM audits"
    ):
        key = (r["symbol_qualified"], r["signature"], r["file_path"], r["line_start"])
        db_hashes[key] = r["content_hash"]

    missing_in_db = sorted(set(jsonl_hashes) - set(db_hashes))
    missing_in_jsonl = sorted(set(db_hashes) - set(jsonl_hashes))
    content_diff = sorted(
        k for k in (set(jsonl_hashes) & set(db_hashes))
        if jsonl_hashes[k] != db_hashes[k]
    )

    def _pretty(k: tuple) -> dict[str, Any]:
        return {
            "symbol_qualified": k[0],
            "signature": k[1],
            "file_path": k[2],
            "line_start": k[3],
        }

    ok = not (missing_in_db or missing_in_jsonl or content_diff)
    return {
        "ok": ok,
        "missing_in_db": [_pretty(k) for k in missing_in_db],
        "missing_in_jsonl": [_pretty(k) for k in missing_in_jsonl],
        "content_diff": [_pretty(k) for k in content_diff],
    }


def export_to_jsonl(conn: sqlite3.Connection, root: Path) -> dict[str, int]:
    """Write the DB to a JSONL tree rooted at `root`, mirroring file_path.

    One .jsonl file per source file, sorted by (line_start, symbol_qualified, signature).
    Returns {"files": N, "entries": M}.
    """
    rows = conn.execute(
        "SELECT * FROM audits ORDER BY file_path, line_start, symbol_qualified, signature"
    ).fetchall()

    by_file: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for r in rows:
        entry = row_to_entry(r)
        by_file[entry["file_path"]].append(entry)

    root.mkdir(parents=True, exist_ok=True)
    root = root.resolve()

    files_written = 0
    entries_written = 0
    for file_path, entries in by_file.items():
        rel = Path(file_path)
        if rel.is_absolute() or ".." in rel.parts:
            raise ValueError(
                f"refusing to export suspicious file_path {file_path!r} "
                "(must be a relative path with no parent references)"
            )
        out_path = (root / rel).with_suffix(rel.suffix + ".jsonl")
        out_path.parent.mkdir(parents=True, exist_ok=True)
        with out_path.open("w", encoding="utf-8") as fh:
            for entry in entries:
                fh.write(json.dumps(_entry_for_export(entry), ensure_ascii=False, sort_keys=True))
                fh.write("\n")
        files_written += 1
        entries_written += len(entries)

    return {"files": files_written, "entries": entries_written}

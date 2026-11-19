from __future__ import annotations

import hashlib
import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

from .schema import (
    AUDIT_COLUMNS,
    DDL,
    HASHED_FIELDS,
    SCHEMA_VERSION,
)


class DBError(Exception):
    pass


def connect(path: Path, *, must_exist: bool = True) -> sqlite3.Connection:
    if must_exist and not path.exists():
        raise DBError(f"database not found: {path} (run `fnaudit init` first)")
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA synchronous = NORMAL")
    return conn


def init_schema(conn: sqlite3.Connection, codebase: str | None = None) -> None:
    conn.executescript(DDL)
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    with conn:
        conn.execute(
            "INSERT OR IGNORE INTO meta(key, value) VALUES (?, ?)",
            ("schema_version", str(SCHEMA_VERSION)),
        )
        conn.execute(
            "INSERT OR IGNORE INTO meta(key, value) VALUES (?, ?)",
            ("created_at", now),
        )
        if codebase:
            conn.execute(
                "INSERT OR REPLACE INTO meta(key, value) VALUES (?, ?)",
                ("codebase", codebase),
            )


def get_meta(conn: sqlite3.Connection, key: str) -> str | None:
    row = conn.execute("SELECT value FROM meta WHERE key = ?", (key,)).fetchone()
    return row["value"] if row else None


def _canonical(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
        except (json.JSONDecodeError, ValueError):
            return value
        return parsed
    return value


def compute_content_hash(entry: dict[str, Any]) -> str:
    payload = {field: _canonical(entry.get(field)) for field in HASHED_FIELDS}
    blob = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()


def _normalize_json_field(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, str):
        return value
    return json.dumps(value, ensure_ascii=False, sort_keys=True)


JSON_FIELDS = ("issues", "global_state", "callers_sample")


def row_to_entry(row) -> dict[str, Any]:
    """Convert a sqlite3.Row from the `audits` table back into a dict with JSON fields parsed."""
    entry = dict(row)
    entry.pop("id", None)
    for field in JSON_FIELDS:
        val = entry.get(field)
        if val is None:
            continue
        try:
            entry[field] = json.loads(val)
        except (json.JSONDecodeError, TypeError):
            pass
    return entry


def list_entries(
    conn: sqlite3.Connection,
    *,
    class_name: str | None = None,
    namespace: str | None = None,
    file_path: str | None = None,
    file_prefix: str | None = None,
    limit: int | None = None,
) -> list[dict[str, Any]]:
    clauses: list[str] = []
    params: list[Any] = []
    if class_name is not None:
        clauses.append("class_name = ?")
        params.append(class_name)
    if namespace is not None:
        clauses.append("namespace = ?")
        params.append(namespace)
    if file_path is not None:
        clauses.append("file_path = ?")
        params.append(file_path)
    if file_prefix is not None:
        clauses.append("file_path LIKE ?")
        params.append(file_prefix + "%")
    where = ("WHERE " + " AND ".join(clauses)) if clauses else ""
    sql = f"SELECT * FROM audits {where} ORDER BY file_path, line_start, symbol_qualified"
    if limit is not None:
        sql += f" LIMIT {int(limit)}"
    return [row_to_entry(r) for r in conn.execute(sql, params).fetchall()]


def stale_entries(
    conn: sqlite3.Connection,
    *,
    current_commit: str,
) -> list[dict[str, Any]]:
    """Return entries whose source_commit is not equal to `current_commit` (or NULL)."""
    sql = (
        "SELECT * FROM audits WHERE source_commit IS NULL OR source_commit != ? "
        "ORDER BY file_path, line_start"
    )
    return [row_to_entry(r) for r in conn.execute(sql, (current_commit,)).fetchall()]


def fts_search(
    conn: sqlite3.Connection,
    query: str,
    *,
    limit: int = 50,
) -> list[dict[str, Any]]:
    sql = """
        SELECT a.*, bm25(audits_fts) AS score
        FROM audits_fts
        JOIN audits a ON a.id = audits_fts.rowid
        WHERE audits_fts MATCH ?
        ORDER BY score
        LIMIT ?
    """
    rows = conn.execute(sql, (query, limit)).fetchall()
    out = []
    for r in rows:
        entry = row_to_entry(r)
        entry["_score"] = entry.pop("score", None)
        out.append(entry)
    return out


def lookup(
    conn: sqlite3.Connection,
    symbol: str,
    *,
    signature: str | None = None,
    file_path: str | None = None,
) -> list[dict[str, Any]]:
    clauses = ["symbol_qualified = ?"]
    params: list[Any] = [symbol]
    if signature:
        clauses.append("signature = ?")
        params.append(signature)
    if file_path:
        clauses.append("file_path = ?")
        params.append(file_path)
    sql = (
        "SELECT * FROM audits WHERE "
        + " AND ".join(clauses)
        + " ORDER BY file_path, line_start"
    )
    return [row_to_entry(r) for r in conn.execute(sql, params).fetchall()]


def normalize_entry(entry: dict[str, Any]) -> dict[str, Any]:
    out = dict(entry)
    for field in JSON_FIELDS:
        if field in out:
            out[field] = _normalize_json_field(out[field])
    for field in AUDIT_COLUMNS:
        out.setdefault(field, None)
    if not out.get("symbol_qualified"):
        raise DBError("entry missing required field: symbol_qualified")
    if not out.get("signature"):
        raise DBError("entry missing required field: signature")
    if not out.get("file_path"):
        raise DBError("entry missing required field: file_path")
    if out.get("line_start") is None:
        raise DBError("entry missing required field: line_start")
    return out


def upsert_audit(
    conn: sqlite3.Connection,
    entry: dict[str, Any],
    *,
    now: str | None = None,
) -> tuple[str, str]:
    """Insert or update an audit entry.

    Returns (action, content_hash) where action is one of:
      'inserted' - new row
      'updated'  - existing row, content changed, reviewed_at bumped
      'unchanged' - existing row, content identical, reviewed_at preserved
    """
    entry = normalize_entry(entry)
    entry["content_hash"] = compute_content_hash(entry)
    if now is None:
        now = datetime.now(timezone.utc).isoformat(timespec="seconds")

    key = (
        entry["symbol_qualified"],
        entry["signature"],
        entry["file_path"],
        entry["line_start"],
    )
    existing = conn.execute(
        "SELECT id, content_hash, reviewed_at FROM audits "
        "WHERE symbol_qualified = ? AND signature = ? AND file_path = ? AND line_start = ?",
        key,
    ).fetchone()

    if existing is not None and existing["content_hash"] == entry["content_hash"]:
        return ("unchanged", entry["content_hash"])

    if entry.get("reviewed_at") is None:
        entry["reviewed_at"] = now

    cols = list(AUDIT_COLUMNS)
    placeholders = ",".join("?" for _ in cols)
    values = [entry[c] for c in cols]

    if existing is None:
        conn.execute(
            f"INSERT INTO audits ({','.join(cols)}) VALUES ({placeholders})",
            values,
        )
        return ("inserted", entry["content_hash"])

    set_clause = ",".join(f"{c} = ?" for c in cols)
    conn.execute(
        f"UPDATE audits SET {set_clause} WHERE id = ?",
        [*values, existing["id"]],
    )
    return ("updated", entry["content_hash"])


def bulk_upsert(
    conn: sqlite3.Connection,
    entries: Iterable[dict[str, Any]],
) -> dict[str, int]:
    counts = {"inserted": 0, "updated": 0, "unchanged": 0}
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    with conn:
        for entry in entries:
            action, _ = upsert_audit(conn, entry, now=now)
            counts[action] += 1
    return counts

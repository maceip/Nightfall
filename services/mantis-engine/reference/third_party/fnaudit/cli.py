from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Iterator

import click

from . import __version__
from .db import (
    DBError,
    bulk_upsert,
    connect,
    fts_search,
    get_meta,
    init_schema,
    list_entries,
    lookup,
    stale_entries,
    upsert_audit,
)
from .jsonl import build_from_jsonl, check_against_jsonl, export_to_jsonl


DEFAULT_DB_ENV = "FNAUDIT_DB"


def _db_path(ctx: click.Context) -> Path:
    path = ctx.obj.get("db_path")
    if path is None:
        raise click.UsageError(
            "no database specified; pass --db or set FNAUDIT_DB"
        )
    return Path(path)


@click.group(context_settings={"help_option_names": ["-h", "--help"]})
@click.version_option(__version__, prog_name="fnaudit")
@click.option(
    "--db",
    type=click.Path(dir_okay=False, path_type=Path),
    envvar=DEFAULT_DB_ENV,
    help="Path to the SQLite database (or set $FNAUDIT_DB).",
)
@click.pass_context
def main(ctx: click.Context, db: Path | None) -> None:
    """Manage per-function audit logs for C/C++ codebases."""
    ctx.ensure_object(dict)
    ctx.obj["db_path"] = db


@main.command()
@click.option("--codebase", help="Human-readable name of the codebase this DB covers.")
@click.option("--force", is_flag=True, help="Overwrite an existing database file.")
@click.pass_context
def init(ctx: click.Context, codebase: str | None, force: bool) -> None:
    """Create a new audit database."""
    path = _db_path(ctx)
    if path.exists():
        if not force:
            raise click.ClickException(
                f"{path} already exists; pass --force to overwrite"
            )
        path.unlink()
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = connect(path, must_exist=False)
    try:
        init_schema(conn, codebase=codebase)
    finally:
        conn.close()
    msg = f"initialized {path}"
    if codebase:
        msg += f" (codebase: {codebase})"
    click.echo(msg)


@main.command()
@click.pass_context
def info(ctx: click.Context) -> None:
    """Print database metadata."""
    path = _db_path(ctx)
    conn = connect(path)
    try:
        rows = conn.execute("SELECT key, value FROM meta ORDER BY key").fetchall()
        count = conn.execute("SELECT COUNT(*) AS c FROM audits").fetchone()["c"]
    finally:
        conn.close()
    click.echo(f"database: {path}")
    click.echo(f"entries:  {count}")
    for row in rows:
        click.echo(f"  {row['key']}: {row['value']}")


def _iter_jsonl(stream) -> Iterator[dict]:
    for lineno, raw in enumerate(stream, start=1):
        line = raw.strip()
        if not line:
            continue
        try:
            obj = json.loads(line)
        except json.JSONDecodeError as exc:
            raise click.ClickException(f"invalid JSON on line {lineno}: {exc}")
        if not isinstance(obj, dict):
            raise click.ClickException(f"line {lineno}: expected JSON object, got {type(obj).__name__}")
        yield obj


@main.command()
@click.option(
    "--file",
    "file_",
    type=click.Path(dir_okay=False, path_type=Path),
    help="Read entry from this JSON file (otherwise read one JSON object from stdin).",
)
@click.pass_context
def add(ctx: click.Context, file_: Path | None) -> None:
    """Insert or update a single audit entry."""
    if file_ is not None:
        raw = file_.read_text(encoding="utf-8")
    else:
        raw = sys.stdin.read()
    try:
        entry = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise click.ClickException(f"invalid JSON: {exc}")
    if not isinstance(entry, dict):
        raise click.ClickException("expected a single JSON object")

    conn = connect(_db_path(ctx))
    try:
        with conn:
            action, content_hash = upsert_audit(conn, entry)
    finally:
        conn.close()
    click.echo(json.dumps({"action": action, "content_hash": content_hash}))


@main.command("bulk-add")
@click.option(
    "--file",
    "file_",
    type=click.Path(dir_okay=False, path_type=Path),
    help="Read JSONL from this file (otherwise read from stdin).",
)
@click.pass_context
def bulk_add(ctx: click.Context, file_: Path | None) -> None:
    """Insert or update many audit entries (one JSON object per line)."""
    stream = file_.open("r", encoding="utf-8") if file_ is not None else sys.stdin
    try:
        conn = connect(_db_path(ctx))
        try:
            counts = bulk_upsert(conn, _iter_jsonl(stream))
        finally:
            conn.close()
    finally:
        if file_ is not None:
            stream.close()
    click.echo(json.dumps(counts))


@main.command()
@click.argument("symbol", required=False)
@click.option("--signature", help="Narrow to this exact signature.")
@click.option("--file", "file_path", help="Narrow to this exact file path.")
@click.option("--batch", is_flag=True, help="Read symbols (one per line) from stdin; emit JSONL.")
@click.pass_context
def get(
    ctx: click.Context,
    symbol: str | None,
    signature: str | None,
    file_path: str | None,
    batch: bool,
) -> None:
    """Look up audit entries by fully-qualified symbol. Always returns a JSON array (empty if no match)."""
    if batch:
        if symbol is not None:
            raise click.UsageError("--batch reads symbols from stdin; do not also pass an argument")
        conn = connect(_db_path(ctx))
        try:
            out = sys.stdout
            for raw in sys.stdin:
                sym = raw.strip()
                if not sym:
                    continue
                matches = lookup(conn, sym, signature=signature, file_path=file_path)
                out.write(json.dumps({"symbol": sym, "matches": matches}, ensure_ascii=False))
                out.write("\n")
            out.flush()
        finally:
            conn.close()
        return

    if symbol is None:
        raise click.UsageError("SYMBOL is required unless --batch is used")
    conn = connect(_db_path(ctx))
    try:
        matches = lookup(conn, symbol, signature=signature, file_path=file_path)
    finally:
        conn.close()
    click.echo(json.dumps(matches, ensure_ascii=False, indent=2))


@main.command()
@click.argument("query")
@click.option("--limit", type=int, default=50, show_default=True)
@click.pass_context
def search(ctx: click.Context, query: str, limit: int) -> None:
    """Full-text search over intent, issues, preconditions, postconditions, and symbol."""
    conn = connect(_db_path(ctx))
    try:
        hits = fts_search(conn, query, limit=limit)
    except DBError as exc:
        raise click.ClickException(str(exc))
    except Exception as exc:
        raise click.ClickException(f"search failed: {exc}")
    finally:
        conn.close()
    click.echo(json.dumps(hits, ensure_ascii=False, indent=2))


@main.command()
@click.argument("audits_dir", type=click.Path(file_okay=False, path_type=Path))
@click.pass_context
def build(ctx: click.Context, audits_dir: Path) -> None:
    """Rebuild the DB from a JSONL tree (clears existing rows first)."""
    conn = connect(_db_path(ctx), must_exist=False)
    try:
        init_schema(conn)
        counts = build_from_jsonl(conn, audits_dir)
    finally:
        conn.close()
    click.echo(json.dumps(counts))


@main.command("export-jsonl")
@click.argument("audits_dir", type=click.Path(file_okay=False, path_type=Path))
@click.pass_context
def export_jsonl(ctx: click.Context, audits_dir: Path) -> None:
    """Write the DB to a JSONL tree, one file per source file mirroring the tree."""
    conn = connect(_db_path(ctx))
    try:
        counts = export_to_jsonl(conn, audits_dir)
    finally:
        conn.close()
    click.echo(json.dumps(counts))


@main.command("list")
@click.option("--class", "class_name", help="Match class name exactly.")
@click.option("--namespace", help="Match namespace exactly.")
@click.option("--file", "file_path", help="Match file path exactly.")
@click.option("--file-prefix", help="Match file paths starting with this prefix.")
@click.option("--limit", type=int, default=None, help="Limit number of results.")
@click.pass_context
def list_cmd(
    ctx: click.Context,
    class_name: str | None,
    namespace: str | None,
    file_path: str | None,
    file_prefix: str | None,
    limit: int | None,
) -> None:
    """List audit entries matching the given filters."""
    conn = connect(_db_path(ctx))
    try:
        entries = list_entries(
            conn,
            class_name=class_name,
            namespace=namespace,
            file_path=file_path,
            file_prefix=file_prefix,
            limit=limit,
        )
    finally:
        conn.close()
    click.echo(json.dumps(entries, ensure_ascii=False, indent=2))


@main.command()
@click.option("--commit", "commit", required=True, help="Current commit. Entries not matching this are stale.")
@click.option("--keys-only", is_flag=True, help="Print only identifying keys, not full entries.")
@click.pass_context
def stale(ctx: click.Context, commit: str, keys_only: bool) -> None:
    """List entries whose source_commit does not match the given ref."""
    conn = connect(_db_path(ctx))
    try:
        entries = stale_entries(conn, current_commit=commit)
    finally:
        conn.close()
    if keys_only:
        keys = [
            {
                "symbol_qualified": e["symbol_qualified"],
                "signature": e["signature"],
                "file_path": e["file_path"],
                "line_start": e["line_start"],
                "source_commit": e.get("source_commit"),
            }
            for e in entries
        ]
        click.echo(json.dumps(keys, ensure_ascii=False, indent=2))
    else:
        click.echo(json.dumps(entries, ensure_ascii=False, indent=2))


@main.command()
@click.argument("audits_dir", type=click.Path(file_okay=False, path_type=Path))
@click.pass_context
def check(ctx: click.Context, audits_dir: Path) -> None:
    """Verify the DB matches the JSONL tree; exit nonzero on any diff."""
    conn = connect(_db_path(ctx))
    try:
        report = check_against_jsonl(conn, audits_dir)
    finally:
        conn.close()
    click.echo(json.dumps(report, ensure_ascii=False, indent=2))
    if not report["ok"]:
        sys.exit(1)


def _run() -> None:
    try:
        main(obj={})
    except DBError as exc:
        click.echo(f"error: {exc}", err=True)
        sys.exit(2)


if __name__ == "__main__":
    _run()

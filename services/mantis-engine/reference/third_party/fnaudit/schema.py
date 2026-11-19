SCHEMA_VERSION = 1

FTS_COLUMNS = (
    "symbol_qualified",
    "intent",
    "issues_text",
    "preconditions",
    "postconditions",
)

DDL = f"""
CREATE TABLE IF NOT EXISTS meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audits (
    id               INTEGER PRIMARY KEY,
    symbol_qualified TEXT    NOT NULL,
    symbol_mangled   TEXT,
    namespace        TEXT,
    class_name       TEXT,
    signature        TEXT    NOT NULL,
    file_path        TEXT    NOT NULL,
    line_start       INTEGER NOT NULL,
    line_end         INTEGER,
    intent           TEXT,
    issues           TEXT,  -- JSON array of {{severity, category, description}}
    global_state     TEXT,  -- JSON {{reads: [...], writes: [...]}}
    preconditions    TEXT,
    postconditions   TEXT,
    callers_sample   TEXT,  -- JSON array
    reviewer         TEXT,
    reviewed_at      TEXT,  -- ISO8601
    source_commit    TEXT,
    content_hash     TEXT    NOT NULL,
    UNIQUE(symbol_qualified, signature, file_path, line_start)
);

CREATE INDEX IF NOT EXISTS idx_audits_qualified ON audits(symbol_qualified);
CREATE INDEX IF NOT EXISTS idx_audits_class     ON audits(class_name);
CREATE INDEX IF NOT EXISTS idx_audits_namespace ON audits(namespace);
CREATE INDEX IF NOT EXISTS idx_audits_file      ON audits(file_path);
CREATE INDEX IF NOT EXISTS idx_audits_mangled   ON audits(symbol_mangled);
CREATE INDEX IF NOT EXISTS idx_audits_commit    ON audits(source_commit);

CREATE VIRTUAL TABLE IF NOT EXISTS audits_fts USING fts5(
    symbol_qualified,
    intent,
    issues_text,
    preconditions,
    postconditions,
    content=''
);

CREATE TRIGGER IF NOT EXISTS audits_ai AFTER INSERT ON audits BEGIN
    INSERT INTO audits_fts(rowid, symbol_qualified, intent, issues_text, preconditions, postconditions)
    VALUES (new.id, new.symbol_qualified, new.intent, new.issues, new.preconditions, new.postconditions);
END;

CREATE TRIGGER IF NOT EXISTS audits_ad AFTER DELETE ON audits BEGIN
    INSERT INTO audits_fts(audits_fts, rowid, symbol_qualified, intent, issues_text, preconditions, postconditions)
    VALUES ('delete', old.id, old.symbol_qualified, old.intent, old.issues, old.preconditions, old.postconditions);
END;

CREATE TRIGGER IF NOT EXISTS audits_au AFTER UPDATE ON audits BEGIN
    INSERT INTO audits_fts(audits_fts, rowid, symbol_qualified, intent, issues_text, preconditions, postconditions)
    VALUES ('delete', old.id, old.symbol_qualified, old.intent, old.issues, old.preconditions, old.postconditions);
    INSERT INTO audits_fts(rowid, symbol_qualified, intent, issues_text, preconditions, postconditions)
    VALUES (new.id, new.symbol_qualified, new.intent, new.issues, new.preconditions, new.postconditions);
END;
"""

AUDIT_COLUMNS = (
    "symbol_qualified",
    "symbol_mangled",
    "namespace",
    "class_name",
    "signature",
    "file_path",
    "line_start",
    "line_end",
    "intent",
    "issues",
    "global_state",
    "preconditions",
    "postconditions",
    "callers_sample",
    "reviewer",
    "reviewed_at",
    "source_commit",
    "content_hash",
)

HASHED_FIELDS = (
    "symbol_qualified",
    "symbol_mangled",
    "namespace",
    "class_name",
    "signature",
    "file_path",
    "line_start",
    "line_end",
    "intent",
    "issues",
    "global_state",
    "preconditions",
    "postconditions",
    "callers_sample",
)

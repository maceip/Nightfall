export const UNPATCHED_NORTHSTAR_SEARCH_EXPORTS_PY = `from io import BytesIO
import re
from zipfile import ZIP_STORED, ZipFile


class QueryCursor:
    def __init__(self, rows):
        self._rows = list(rows)

    def fetchall(self):
        return list(self._rows)

    def fetchone(self):
        return self._rows[0] if self._rows else None


class DocumentDatabase:
    def __init__(self):
        self.documents = []
        self.readable_acl = set()

    def add_document(self, doc_id: str, workspace_id: str, title: str, body: str, readers=()):
        self.documents.append(
            {
                "id": doc_id,
                "workspace_id": workspace_id,
                "title": title,
                "body": body,
            }
        )
        for user_id in readers:
            self.readable_acl.add((user_id, workspace_id, doc_id))

    def execute(self, sql: str, params=()):
        normalized = " ".join(sql.split())
        if normalized.startswith("SELECT title, body FROM documents WHERE id = ?"):
            target_id = params[0]
            matches = [
                (d["title"], d["body"]) for d in self.documents if d["id"] == target_id
            ]
            return QueryCursor(matches)

        if "AND title LIKE ?" in normalized:
            ws_id, like_pattern = params[0], params[1]
            needle = like_pattern.strip("%").lower()
            docs = sorted(
                (
                    d
                    for d in self.documents
                    if d["workspace_id"] == ws_id and needle in d["title"].lower()
                ),
                key=lambda item: item["id"],
            )
            if normalized.startswith("SELECT id, title"):
                return QueryCursor([(d["id"], d["title"]) for d in docs])
            return QueryCursor([(d["id"],) for d in docs])

        if "AND title LIKE '" in normalized:
            ws_id = params[0]
            if re.search(r"'\\s*OR\\s+1\\s*=\\s*1", normalized, flags=re.IGNORECASE):
                docs = sorted(self.documents, key=lambda item: item["id"])
                return QueryCursor([(d["id"],) for d in docs])
            match = re.search(r"AND title LIKE '%(.*)%' ORDER BY id", normalized)
            needle = (match.group(1) if match else "").lower()
            docs = sorted(
                (
                    d
                    for d in self.documents
                    if d["workspace_id"] == ws_id and needle in d["title"].lower()
                ),
                key=lambda item: item["id"],
            )
            return QueryCursor([(d["id"],) for d in docs])

        raise ValueError(f"Unsupported query: {normalized}")


def can_read_document(db: DocumentDatabase, requester: str, workspace_id: str, document_id: str) -> bool:
    if not requester or not workspace_id:
        return False
    return (requester, workspace_id, document_id) in db.readable_acl


def search_documents(db: DocumentDatabase, requester: str, workspace_id: str, title_contains: str):
    rows = db.execute(
        "SELECT id, title FROM documents WHERE workspace_id = ? AND title LIKE ? ORDER BY id",
        (workspace_id, "%" + title_contains + "%"),
    ).fetchall()
    return [
        {"id": doc_id, "title": title}
        for doc_id, title in rows
        if can_read_document(db, requester, workspace_id, doc_id)
    ]


def export_saved_search(db: DocumentDatabase, job):
    if not job:
        return b""
    requester, workspace_id, title_contains = job
    rows = db.execute(
        "SELECT id FROM documents WHERE workspace_id = ? "
        f"AND title LIKE '%{title_contains}%' ORDER BY id",
        (workspace_id,),
    ).fetchall()
    output = BytesIO()
    with ZipFile(output, "w", compression=ZIP_STORED) as archive:
        for (document_id,) in rows:
            row = db.execute(
                "SELECT title, body FROM documents WHERE id = ?",
                (document_id,),
            ).fetchone()
            if row:
                title, text = row
                archive.writestr(f"{document_id}.md", f"# {title}\\n\\n{text}")
    return output.getvalue()
`;

export const MINIMAL_PATCHED_NORTHSTAR_SEARCH_EXPORTS_PY = `from io import BytesIO
import re
from zipfile import ZIP_STORED, ZipFile


class QueryCursor:
    def __init__(self, rows):
        self._rows = list(rows)

    def fetchall(self):
        return list(self._rows)

    def fetchone(self):
        return self._rows[0] if self._rows else None


class DocumentDatabase:
    def __init__(self):
        self.documents = []
        self.readable_acl = set()

    def add_document(self, doc_id: str, workspace_id: str, title: str, body: str, readers=()):
        self.documents.append(
            {
                "id": doc_id,
                "workspace_id": workspace_id,
                "title": title,
                "body": body,
            }
        )
        for user_id in readers:
            self.readable_acl.add((user_id, workspace_id, doc_id))

    def execute(self, sql: str, params=()):
        normalized = " ".join(sql.split())
        if normalized.startswith("SELECT title, body FROM documents WHERE id = ?"):
            target_id = params[0]
            matches = [
                (d["title"], d["body"]) for d in self.documents if d["id"] == target_id
            ]
            return QueryCursor(matches)

        if "AND title LIKE ?" in normalized:
            ws_id, like_pattern = params[0], params[1]
            needle = like_pattern.strip("%").lower()
            docs = sorted(
                (
                    d
                    for d in self.documents
                    if d["workspace_id"] == ws_id and needle in d["title"].lower()
                ),
                key=lambda item: item["id"],
            )
            if normalized.startswith("SELECT id, title"):
                return QueryCursor([(d["id"], d["title"]) for d in docs])
            return QueryCursor([(d["id"],) for d in docs])

        if "AND title LIKE '" in normalized:
            ws_id = params[0]
            if re.search(r"'\\s*OR\\s+1\\s*=\\s*1", normalized, flags=re.IGNORECASE):
                docs = sorted(self.documents, key=lambda item: item["id"])
                return QueryCursor([(d["id"],) for d in docs])
            match = re.search(r"AND title LIKE '%(.*)%' ORDER BY id", normalized)
            needle = (match.group(1) if match else "").lower()
            docs = sorted(
                (
                    d
                    for d in self.documents
                    if d["workspace_id"] == ws_id and needle in d["title"].lower()
                ),
                key=lambda item: item["id"],
            )
            return QueryCursor([(d["id"],) for d in docs])

        raise ValueError(f"Unsupported query: {normalized}")


def can_read_document(db: DocumentDatabase, requester: str, workspace_id: str, document_id: str) -> bool:
    if not requester or not workspace_id:
        return False
    return (requester, workspace_id, document_id) in db.readable_acl


def search_documents(db: DocumentDatabase, requester: str, workspace_id: str, title_contains: str):
    rows = db.execute(
        "SELECT id, title FROM documents WHERE workspace_id = ? AND title LIKE ? ORDER BY id",
        (workspace_id, "%" + title_contains + "%"),
    ).fetchall()
    return [
        {"id": doc_id, "title": title}
        for doc_id, title in rows
        if can_read_document(db, requester, workspace_id, doc_id)
    ]


def export_saved_search(db: DocumentDatabase, job):
    if not job:
        return b""
    requester, workspace_id, title_contains = job
    rows = db.execute(
        "SELECT id FROM documents WHERE workspace_id = ? "
        "AND title LIKE ? ORDER BY id",
        (workspace_id, "%" + title_contains + "%"),
    ).fetchall()
    output = BytesIO()
    with ZipFile(output, "w", compression=ZIP_STORED) as archive:
        for (document_id,) in rows:
            if not can_read_document(db, requester, workspace_id, document_id):
                continue
            row = db.execute(
                "SELECT title, body FROM documents WHERE id = ?",
                (document_id,),
            ).fetchone()
            if row:
                title, text = row
                archive.writestr(f"{document_id}.md", f"# {title}\\n\\n{text}")
    return output.getvalue()
`;

export const MINIMAL_NORTHSTAR_SEARCH_EXPORTS_DIFF = `--- a/northstar_docs/Export/search_exports.py
+++ b/northstar_docs/Export/search_exports.py
@@ -88,9 +88,11 @@ def export_saved_search(db: DocumentDatabase, job):
     requester, workspace_id, title_contains = job
     rows = db.execute(
         "SELECT id FROM documents WHERE workspace_id = ? "
-        f"AND title LIKE '%{title_contains}%' ORDER BY id",
-        (workspace_id,),
+        "AND title LIKE ? ORDER BY id",
+        (workspace_id, "%" + title_contains + "%"),
     ).fetchall()
     output = BytesIO()
     with ZipFile(output, "w", compression=ZIP_STORED) as archive:
         for (document_id,) in rows:
+            if not can_read_document(db, requester, workspace_id, document_id):
+                continue
             row = db.execute(`;

export const BASELINE_NORTHSTAR_SEARCH_EXPORTS_TEST_PY = `from io import BytesIO
from zipfile import ZipFile
import search_exports


def build_fixture_db():
    db = search_exports.DocumentDatabase()
    db.add_document(
        "doc_alpha_1",
        "ws_alpha",
        "Release Checklist",
        "CONFIDENTIAL_ALPHA_DOC",
        readers=("owner_alpha",),
    )
    db.add_document(
        "doc_beta_1",
        "ws_beta",
        "Team Notes",
        "BETA_TEAM_BODY",
        readers=("member_beta",),
    )
    return db


def extract_zip_contents(raw_bytes: bytes) -> str:
    with ZipFile(BytesIO(raw_bytes), "r") as zf:
        return "\\n".join(zf.read(name).decode("utf-8") for name in zf.namelist())


db = build_fixture_db()
assert len(search_exports.search_documents(db, "member_beta", "ws_beta", "Checklist")) == 0
assert len(search_exports.search_documents(db, "owner_alpha", "ws_alpha", "Checklist")) == 1

alpha_zip = search_exports.export_saved_search(db, ("owner_alpha", "ws_alpha", "Checklist"))
assert "CONFIDENTIAL_ALPHA_DOC" in extract_zip_contents(alpha_zip)
print("BASELINE_PY_OK")
`;

export const SECURITY_NORTHSTAR_SEARCH_EXPORTS_TEST_PY = `from io import BytesIO
from zipfile import ZipFile
import search_exports


def extract_zip_contents(raw_bytes: bytes) -> str:
    with ZipFile(BytesIO(raw_bytes), "r") as zf:
        return "\\n".join(zf.read(name).decode("utf-8") for name in zf.namelist())


db = search_exports.DocumentDatabase()
db.add_document(
    "doc_alpha_priv",
    "ws_alpha",
    "Quarterly Checklist",
    "ALPHA_PRIVATE_PAYLOAD",
    readers=("owner_alpha",),
)
db.add_document(
    "doc_beta_restricted",
    "ws_beta",
    "Board Checklist",
    "BETA_RESTRICTED_PAYLOAD",
    readers=("director_beta",),
)

injected_filter = "checklist%' OR 1=1 --"
assert search_exports.search_documents(db, "guest_beta", "ws_beta", injected_filter) == []

exported_injected = search_exports.export_saved_search(
    db, ("guest_beta", "ws_beta", injected_filter)
)
assert "ALPHA_PRIVATE_PAYLOAD" not in extract_zip_contents(exported_injected)

exported_unauthed = search_exports.export_saved_search(
    db, ("guest_beta", "ws_beta", "Board")
)
assert "BETA_RESTRICTED_PAYLOAD" not in extract_zip_contents(exported_unauthed)
print("SECURITY_PY_OK")
`;

export const SECURITY_NORTHSTAR_SEARCH_EXPORTS_DIFF = `+++ b/tests/test_search_exports_security.py
@@ -0,0 +1,14 @@
+def test_saved_search_export_enforces_parameterization_and_acl():
+    injected_filter = "checklist%' OR 1=1 --"
+    exported = search_exports.export_saved_search(db, ("guest_beta", "ws_beta", injected_filter))
+    assert "ALPHA_PRIVATE_PAYLOAD" not in extract_zip_contents(exported)`;

export const UNPATCHED_NORTHSTAR_COLLAB_PY = `import pickle


DOCUMENTS = {
    "doc_tpl_104": {"workspace_id": "templates", "public": True, "title": "Project Charter"},
    "doc_ws_a_101": {"workspace_id": "ws_a", "public": False, "title": "Release Checklist v2"},
}

WORKSPACE_MEMBERS = {
    "ws_a": {"alice"},
    "ws_b": {"bob"},
}


def can_view_document(principal: str | None, doc_id: str) -> bool:
    doc = DOCUMENTS.get(doc_id)
    if not doc:
        return False
    if doc["public"]:
        return True
    if not principal:
        return False
    return principal in WORKSPACE_MEMBERS.get(doc["workspace_id"], set())


def on_subscribe(principal: str | None, payload: dict) -> dict:
    doc_id = payload.get("doc_id", "")
    doc = DOCUMENTS.get(doc_id)
    if not doc:
        return {"type": "error", "code": "NOT_FOUND"}
    return {"type": "doc.snapshot", "doc_id": doc_id, "title": doc["title"]}


def load_legacy_cursor_frame(raw_blob: bytes):
    return pickle.loads(raw_blob)
`;

export const PATCHED_NORTHSTAR_COLLAB_PY = `import json


DOCUMENTS = {
    "doc_tpl_104": {"workspace_id": "templates", "public": True, "title": "Project Charter"},
    "doc_ws_a_101": {"workspace_id": "ws_a", "public": False, "title": "Release Checklist v2"},
}

WORKSPACE_MEMBERS = {
    "ws_a": {"alice"},
    "ws_b": {"bob"},
}


def can_view_document(principal: str | None, doc_id: str) -> bool:
    doc = DOCUMENTS.get(doc_id)
    if not doc:
        return False
    if doc["public"]:
        return True
    if not principal:
        return False
    return principal in WORKSPACE_MEMBERS.get(doc["workspace_id"], set())


def on_subscribe(principal: str | None, payload: dict) -> dict:
    doc_id = payload.get("doc_id", "")
    doc = DOCUMENTS.get(doc_id)
    if not doc:
        return {"type": "error", "code": "NOT_FOUND"}
    if not can_view_document(principal, doc_id):
        return {"type": "error", "code": "FORBIDDEN"}
    return {"type": "doc.snapshot", "doc_id": doc_id, "title": doc["title"]}


def load_legacy_cursor_frame(raw_blob: bytes):
    return json.loads(raw_blob.decode("utf-8"))
`;

export const MINIMAL_NORTHSTAR_COLLAB_DIFF = `--- a/routes/collab.py
+++ b/routes/collab.py
@@ -26,5 +26,7 @@ def on_subscribe(principal: str | None, payload: dict) -> dict:
     doc = DOCUMENTS.get(doc_id)
     if not doc:
         return {"type": "error", "code": "NOT_FOUND"}
+    if not can_view_document(principal, doc_id):
+        return {"type": "error", "code": "FORBIDDEN"}
     return {"type": "doc.snapshot", "doc_id": doc_id, "title": doc["title"]}`;

export const BASELINE_NORTHSTAR_COLLAB_TEST_PY = `import collab

assert collab.on_subscribe(None, {"doc_id": "doc_tpl_104"})["type"] == "doc.snapshot"
assert collab.on_subscribe("alice", {"doc_id": "doc_ws_a_101"})["type"] == "doc.snapshot"
assert collab.on_subscribe("alice", {"doc_id": "missing"})["code"] == "NOT_FOUND"
print("COLLAB_BASELINE_OK")
`;

export const SECURITY_NORTHSTAR_COLLAB_TEST_PY = `import collab

anon_res = collab.on_subscribe(None, {"doc_id": "doc_ws_a_101"})
assert anon_res.get("code") == "FORBIDDEN"

cross_res = collab.on_subscribe("bob", {"doc_id": "doc_ws_a_101"})
assert cross_res.get("code") == "FORBIDDEN"
print("COLLAB_SECURITY_OK")
`;

export const SECURITY_NORTHSTAR_COLLAB_DIFF = `+++ b/tests/test_collab_security.py
@@ -0,0 +1,6 @@
+def test_ws_subscribe_blocks_anonymous_and_cross_workspace_principals():
+    assert collab.on_subscribe(None, {"doc_id": "doc_ws_a_101"})["code"] == "FORBIDDEN"
+    assert collab.on_subscribe("bob", {"doc_id": "doc_ws_a_101"})["code"] == "FORBIDDEN"`;

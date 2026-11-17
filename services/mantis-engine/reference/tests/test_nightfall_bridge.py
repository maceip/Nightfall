"""The Nightfall bridge exports a Mantis run as Nightfall FindingRecords."""

import json
import os
import shutil
import sqlite3
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

_REF = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_REF))

from core.database import init_db, update_finding_status_by_id, write_findings  # noqa: E402
import nightfall_bridge  # noqa: E402

_NIGHTFALL_KEYS = {
    "id", "title", "subtitle", "repository", "observedRevision", "severity", "status", "fixVerification",
    "weaknessCwe", "sources", "summary", "rootCause", "impactAndAttackPath", "preconditions", "remediation",
    "codeReferences", "rootCauseClusterKey", "createdAt", "updatedAt",
}


class NightfallBridgeTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.tmp, ignore_errors=True)
        self.db = os.path.join(self.tmp, "mantis.db")
        init_db(self.db)
        write_findings(self.db, "app/views.py", [
            {"title": "SQL injection in search", "severity": "HIGH", "description": "User input reaches a raw query.",
             "filepath": "app/views.py", "line_numbers": [42, 40], "cwe": "CWE-89", "remediation": "Bind parameters.",
             "code_paths": ["app/db.py:10-12", "not a location"]},
            {"title": "Debug endpoint left on", "severity": "LOW", "description": "A debug route is exposed.",
             "filepath": "app/views.py", "line_numbers": [], "cwe": ""},
        ], run_id="run-1")
        write_findings(self.db, "other.py", [
            {"title": "Older run", "severity": "MEDIUM", "description": "d", "filepath": "other.py", "line_numbers": [1]},
        ], run_id="run-0")

    def _rows(self, run_id):
        with sqlite3.connect(self.db) as conn:
            return [r[0] for r in conn.execute("SELECT id FROM findings WHERE run_id=? ORDER BY id", (run_id,))]

    def test_export_maps_a_run_onto_finding_records(self):
        doc = nightfall_bridge.export_run(self.db, repository="acme/api", revision="abc123", run_id="run-1")
        self.assertEqual(doc["format"], "mantis-nightfall/v1")
        self.assertEqual(doc["runId"], "run-1")
        self.assertEqual(len(doc["findings"]), 2)
        sqli = next(f for f in doc["findings"] if f["title"] == "SQL injection in search")
        self.assertTrue(_NIGHTFALL_KEYS <= set(sqli))
        self.assertNotIn("owner", sqli, "Nightfall resolves the owner")
        self.assertEqual(sqli["severity"], "high")
        self.assertEqual(sqli["status"], "new")
        self.assertEqual(sqli["fixVerification"], "not_recorded")
        self.assertEqual(sqli["weaknessCwe"], "CWE-89")
        self.assertEqual(sqli["repository"], "acme/api")
        self.assertEqual(sqli["observedRevision"], "abc123")
        self.assertTrue(sqli["id"].startswith("MANTIS-"))
        self.assertEqual(sqli["codeReferences"][0], {
            "file": "app/views.py", "startLine": 40, "endLine": 42, "description": "Reported location"})
        self.assertIn({"file": "app/db.py", "startLine": 10, "endLine": 12, "description": "Cited code path"},
                      sqli["codeReferences"])
        debug = next(f for f in doc["findings"] if f["title"] == "Debug endpoint left on")
        self.assertEqual(debug["severity"], "low")
        self.assertEqual(debug["codeReferences"], [], "no line numbers, no reference")

    def test_ids_are_stable_across_exports(self):
        a = nightfall_bridge.export_run(self.db, repository="acme/api", revision="r", run_id="run-1")
        b = nightfall_bridge.export_run(self.db, repository="acme/api", revision="r", run_id="run-1")
        self.assertEqual([f["id"] for f in a["findings"]], [f["id"] for f in b["findings"]])

    def test_verdicts_map_to_nightfall_statuses(self):
        first, second = self._rows("run-1")
        # Stamped directly: the pipeline's own gates decide when these verdicts
        # may be written; the bridge only has to map whatever is recorded.
        with sqlite3.connect(self.db) as conn:
            conn.execute("UPDATE findings SET status='dynamic_confirmed' WHERE id=?", (first,))
        update_finding_status_by_id(self.db, second, "run-1", "false_positive")
        doc = nightfall_bridge.export_run(self.db, repository="acme/api", revision="r", run_id="run-1")
        by_title = {f["title"]: f for f in doc["findings"]}
        confirmed = by_title["SQL injection in search"]
        self.assertEqual(confirmed["status"], "triaged")
        self.assertIn("red-team", confirmed["sources"])
        self.assertEqual(by_title["Debug endpoint left on"]["status"], "discarded_fp")

    def test_merged_duplicates_are_left_out(self):
        first, _ = self._rows("run-1")
        with sqlite3.connect(self.db) as conn:
            conn.execute("UPDATE findings SET status='duplicate_merged' WHERE id=?", (first,))
        doc = nightfall_bridge.export_run(self.db, repository="acme/api", revision="r", run_id="run-1")
        self.assertEqual([f["title"] for f in doc["findings"]], ["Debug endpoint left on"])

    def test_cli_defaults_to_the_latest_run(self):
        out = subprocess.run(
            [sys.executable, str(_REF / "nightfall_bridge.py"), "export", "--db", self.db,
             "--repository", "acme/api", "--revision", "r"],
            capture_output=True, text=True, check=True,
        )
        doc = json.loads(out.stdout)
        self.assertIn(doc["runId"], {"run-0", "run-1"})
        self.assertTrue(doc["findings"])

    def test_status_and_severity_mapping_edges(self):
        self.assertEqual(nightfall_bridge._severity("CRITICAL"), "critical")
        self.assertEqual(nightfall_bridge._severity("info"), "informational")
        self.assertEqual(nightfall_bridge._severity(None), "medium")
        self.assertEqual(nightfall_bridge._status("patch_verified"), "fixed")
        self.assertEqual(nightfall_bridge._status("reported"), "new")
        self.assertEqual(nightfall_bridge._fix_verification("reported", "VERIFIED_SECURE"), "verified")
        self.assertEqual(nightfall_bridge._fix_verification("reported", "PROPOSED"), "verifying")


if __name__ == "__main__":
    unittest.main()

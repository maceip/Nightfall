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
        self.assertEqual(confirmed["sources"], ["nightfall", "sast"], "a Mantis proof is not a Nightfall red-team proof")
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
        self.assertEqual(nightfall_bridge._status("patch_verified"), "triaged", "Mantis never closes a finding")
        self.assertEqual(nightfall_bridge._status("reported"), "new")
        self.assertEqual(nightfall_bridge._fix_verification("reported", "VERIFIED_SECURE"), "verifying",
                         "pending until Nightfall verifies the patch itself")
        self.assertEqual(nightfall_bridge._fix_verification("patch_verified", None), "verifying")
        self.assertEqual(nightfall_bridge._fix_verification("reported", "PROPOSED"), "verifying")


    def test_latest_run_is_taken_from_the_runs_table_even_without_findings(self):
        with sqlite3.connect(self.db) as conn:
            conn.execute("INSERT INTO runs (run_id, started) VALUES ('run-clean', '2999-01-01 00:00:00')")
        doc = nightfall_bridge.export_run(self.db, repository="acme/api", revision="r")
        self.assertEqual(doc["runId"], "run-clean")
        self.assertEqual(doc["findings"], [], "a clean latest run, not an older run's findings")

    def test_an_unknown_run_id_is_an_error_not_a_clean_result(self):
        with self.assertRaises(nightfall_bridge.UnknownRunError):
            nightfall_bridge.export_run(self.db, repository="acme/api", revision="r", run_id="no-such-run")
        out = subprocess.run(
            [sys.executable, str(_REF / "nightfall_bridge.py"), "export", "--db", self.db,
             "--repository", "acme/api", "--revision", "r", "--run-id", "no-such-run"],
            capture_output=True, text=True,
        )
        self.assertEqual(out.returncode, 1)
        self.assertEqual(out.stdout, "")

    def test_failed_patch_verification_is_a_regression(self):
        self.assertEqual(nightfall_bridge._fix_verification("static_confirmed", "VERIFICATION_FAILED"),
                         "regression_detected")
    def test_a_database_with_no_run_is_an_error(self):
        empty = os.path.join(self.tmp, "empty.db")
        init_db(empty)
        with self.assertRaises(nightfall_bridge.NoRunError):
            nightfall_bridge.export_run(empty, repository="acme/api", revision="r")

    def test_runs_are_scoped_to_the_requested_target(self):
        repo_a = os.path.join(self.tmp, "repo-a"); repo_b = os.path.join(self.tmp, "repo-b")
        os.makedirs(repo_a); os.makedirs(repo_b)
        with sqlite3.connect(self.db) as conn:
            conn.execute("INSERT INTO runs (run_id, started, metadata_json) VALUES ('run-a', '2999-01-01', ?)",
                         (json.dumps({"target_root": repo_a}),))
            conn.execute("INSERT INTO runs (run_id, started, metadata_json) VALUES ('run-b', '2999-01-02', ?)",
                         (json.dumps({"target_root": repo_b}),))
        doc = nightfall_bridge.export_run(self.db, repository="a", revision="r", target=repo_a)
        self.assertEqual(doc["runId"], "run-a", "repo-b ran later, but it is another repository")
        with self.assertRaises(nightfall_bridge.RunTargetMismatchError):
            nightfall_bridge.export_run(self.db, repository="a", revision="r", run_id="run-b", target=repo_a)
        with self.assertRaises(nightfall_bridge.NoRunError):
            nightfall_bridge.export_run(self.db, repository="c", revision="r", target=self.tmp)

    def test_resume_target_parsing(self):
        self.assertEqual(nightfall_bridge._resume_target(["--resume", "run-9"]), "run-9")
        self.assertEqual(nightfall_bridge._resume_target(["--resume=run-9"]), "run-9")
        self.assertEqual(nightfall_bridge._resume_target(["--resume", "--yes"]), "")
        self.assertEqual(nightfall_bridge._resume_target(["--resume"]), "")
        self.assertIsNone(nightfall_bridge._resume_target(["--depth", "5"]))
        self.assertEqual(nightfall_bridge._resume_target(["--resume", "a", "--resume=b"]), "b", "last one wins")

    def test_several_new_runs_over_the_target_are_ambiguous(self):
        with self.assertRaises(nightfall_bridge.AmbiguousRunError):
            with sqlite3.connect(self.db) as conn:
                conn.execute("INSERT INTO runs (run_id) VALUES ('x1')")
                conn.execute("INSERT INTO runs (run_id) VALUES ('x2')")
            nightfall_bridge._scanned_run_id(self.db, {"run-0", "run-1"}, [], self.tmp)


class NightfallBridgeScanTest(unittest.TestCase):
    """The scan command, driving a stand-in for main.py placed next to a copy of the bridge."""

    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.tmp, ignore_errors=True)
        shutil.copy(_REF / "nightfall_bridge.py", self.tmp)
        self.db = os.path.join(self.tmp, "mantis.db")
        init_db(self.db)

    def _main(self, body):
        Path(self.tmp, "main.py").write_text(
            "import sqlite3, sys, os, time\n"
            "db = sys.argv[sys.argv.index('--db') + 1]\n" + body, encoding="utf-8")

    def _scan(self, *mantis_args, **kw):
        return subprocess.Popen(
            [sys.executable, os.path.join(self.tmp, "nightfall_bridge.py"), "scan", "--db", self.db,
             "--repository", "acme/api", "--revision", "r", "--target", self.tmp, "--", *mantis_args],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, **kw)

    def test_a_partially_failed_run_still_returns_its_findings(self):
        self._main(
            "c = sqlite3.connect(db)\n"
            "c.execute(\"INSERT INTO runs (run_id) VALUES ('run-p')\")\n"
            "c.execute(\"INSERT INTO findings (run_id, filepath, title, severity, description, line_numbers) "
            "VALUES ('run-p', 'a.py', 'Kept', 'HIGH', 'd', '[3]')\")\n"
            "c.commit()\n"
            "sys.exit(1)\n")
        out, err = self._scan().communicate(timeout=60)
        doc = json.loads(out)
        self.assertEqual(doc["runId"], "run-p")
        self.assertEqual(doc["mantisExitCode"], 1)
        self.assertEqual([f["title"] for f in doc["findings"]], ["Kept"])

    def test_a_resumed_run_is_exported(self):
        with sqlite3.connect(self.db) as conn:
            conn.execute("INSERT INTO runs (run_id) VALUES ('run-r')")
        self._main(
            "c = sqlite3.connect(db)\n"
            "c.execute(\"INSERT INTO findings (run_id, filepath, title, severity, description, line_numbers) "
            "VALUES ('run-r', 'b.py', 'Found on resume', 'LOW', 'd', '[2]')\")\n"
            "c.commit()\n")
        out, _ = self._scan("--resume", "run-r").communicate(timeout=60)
        doc = json.loads(out)
        self.assertEqual(doc["runId"], "run-r")
        self.assertEqual([f["title"] for f in doc["findings"]], ["Found on resume"])

    def test_a_resume_mantis_refused_is_a_failure_not_the_old_findings(self):
        with sqlite3.connect(self.db) as conn:
            conn.execute("INSERT INTO runs (run_id) VALUES ('run-old')")
            conn.execute("INSERT INTO findings (run_id, filepath, title, severity, description, line_numbers) "
                         "VALUES ('run-old', 'c.py', 'Stale', 'HIGH', 'd', '[1]')")
        self._main("sys.exit(2)\n")  # refuses before touching the run
        proc = self._scan("--resume", "run-old")
        out, _ = proc.communicate(timeout=60)
        self.assertEqual(proc.returncode, 2)
        self.assertEqual(out, "")

    def test_a_clean_exit_without_a_run_is_a_failure(self):
        self._main("sys.exit(0)\n")
        proc = self._scan()
        out, _ = proc.communicate(timeout=60)
        self.assertEqual(proc.returncode, 1)
        self.assertEqual(out, "")

    def test_a_run_that_never_started_fails(self):
        self._main("sys.exit(3)\n")
        proc = self._scan()
        proc.communicate(timeout=60)
        self.assertEqual(proc.returncode, 3)

    def test_stopping_the_bridge_stops_the_scan(self):
        pid_file = os.path.join(self.tmp, "child.pid")
        self._main(f"open({pid_file!r}, 'w').write(str(os.getpid()))\ntime.sleep(300)\n")
        proc = self._scan()
        import time as _t
        deadline = _t.time() + 30
        while not os.path.exists(pid_file) and _t.time() < deadline:
            _t.sleep(0.1)
        child = int(Path(pid_file).read_text())
        proc.terminate()
        proc.communicate(timeout=60)
        deadline = _t.time() + 30
        alive = True
        while _t.time() < deadline:
            try:
                os.kill(child, 0)
            except ProcessLookupError:
                alive = False
                break
            _t.sleep(0.1)
        self.assertFalse(alive, "the Mantis process outlived the bridge")

if __name__ == "__main__":
    unittest.main()

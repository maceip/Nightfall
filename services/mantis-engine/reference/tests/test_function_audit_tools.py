"""Tests for Mantis per-symbol fnaudit ledger, 800-token audit briefing, and codenav integration."""

from __future__ import annotations

import json
import os
import shutil
import tempfile
import unittest
from pathlib import Path

_REF = Path(__file__).resolve().parent.parent
import sys

if str(_REF) not in sys.path:
    sys.path.insert(0, str(_REF))

from core.context import RunContext, current_run_context  # noqa: E402
from core.database import init_db  # noqa: E402
from core.environments.static_env import StaticOnlyEnvironment  # noqa: E402
from core.llm_gateway import UNTRUSTED_DATA_END, UNTRUSTED_DATA_START  # noqa: E402
from tools.function_audit_tools import (  # noqa: E402
    codenav_query,
    get_function_audit,
    record_function_audit,
    resolve_codenav_binary,
    summarize_function_audits,
)


class FunctionAuditToolsTest(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.tmp = tempfile.mkdtemp()
        self.repo = os.path.join(self.tmp, "repo")
        os.makedirs(os.path.join(self.repo, "src"), exist_ok=True)
        Path(self.repo, "src", "parser.c").write_text(
            "int parse_packet(const char *buf, size_t len) {\n"
            "    if (len < 4) return -1;\n"
            "    size_t body = len - 5;\n"
            "    return (int)body;\n"
            "}\n",
            encoding="utf-8",
        )
        Path(self.repo, "src", "helper.c").write_text(
            "int clamp_len(int n) {\n"
            "    return n < 0 ? 0 : n;\n"
            "}\n",
            encoding="utf-8",
        )
        self.db_path = os.path.join(self.tmp, "mantis.db")
        init_db(self.db_path)
        self.ctx = RunContext(
            jail_dir=self.repo,
            path_root=self.repo,
            db_path=self.db_path,
            target_file=self.repo,
            run_id="run-fnaudit-1",
            snapshot_id="deadbeef1234",
            sandbox=StaticOnlyEnvironment(target_path=self.repo),
        )
        self._tok = current_run_context.set(self.ctx)

    async def asyncTearDown(self):
        current_run_context.reset(self._tok)
        shutil.rmtree(self.tmp, ignore_errors=True)

    async def test_record_lookup_and_detect_body_drift(self):
        raw = await record_function_audit(
            symbol_qualified="parse_packet",
            filepath="src/parser.c",
            line_start=1,
            line_end=5,
            intent="Validate packet length and return payload byte count.",
            issues_json=json.dumps([
                {
                    "severity": "high",
                    "category": "integer-underflow",
                    "description": "len - 5 underflows size_t when len == 4.",
                }
            ]),
            reasoning_trace="//! len=4 passes len < 4 guard, then len - 5 wraps to SIZE_MAX",
        )
        res = json.loads(raw)
        self.assertEqual(res["status"], "ok")
        self.assertEqual(res["action"], "inserted")
        self.assertEqual(len(res["body_sha"]), 64)
        self.assertTrue(res["trace_artifact"].endswith(".trace.md"))

        looked = await get_function_audit(symbol="parse_packet")
        self.assertTrue(looked.startswith(UNTRUSTED_DATA_START))
        self.assertTrue(looked.endswith(UNTRUSTED_DATA_END))
        self.assertIn('"body_stale": false', looked)
        self.assertIn("integer-underflow", looked)

        # Mutate the underlying function body and confirm body_stale flips True.
        Path(self.repo, "src", "parser.c").write_text(
            "int parse_packet(const char *buf, size_t len) {\n"
            "    if (len < 5) return -1;\n"
            "    size_t body = len - 5;\n"
            "    return (int)body;\n"
            "}\n",
            encoding="utf-8",
        )
        after = await get_function_audit(symbol="parse_packet")
        self.assertIn('"body_stale": true', after)

    async def test_refuses_nonexistent_files_and_out_of_bounds_lines(self):
        missing = await record_function_audit(
            symbol_qualified="ghost",
            filepath="src/missing.c",
            line_start=1,
            line_end=5,
            intent="Does not exist.",
        )
        self.assertTrue(missing.startswith("Error:"))

        oob = await record_function_audit(
            symbol_qualified="parse_packet",
            filepath="src/parser.c",
            line_start=1,
            line_end=99,
            intent="Out of bounds span.",
        )
        self.assertIn("exceeds", oob)

        escape = await record_function_audit(
            symbol_qualified="escape",
            filepath="../outside.c",
            line_start=1,
            line_end=1,
            intent="Attempt traversal.",
        )
        self.assertTrue(escape.startswith("Error:"))

    async def test_summarize_ranks_by_severity_and_bounds_tokens(self):
        await record_function_audit(
            symbol_qualified="clamp_len",
            filepath="src/helper.c",
            line_start=1,
            line_end=3,
            intent="Clamp negative lengths to zero.",
            issues_json="[]",
        )
        await record_function_audit(
            symbol_qualified="parse_packet",
            filepath="src/parser.c",
            line_start=1,
            line_end=5,
            intent="Parse header length.",
            issues_json=json.dumps([
                {"severity": "critical", "category": "underflow", "description": "size_t wrap on len==4"}
            ]),
        )
        summary = await summarize_function_audits(file_prefix="src/", top_n=5)
        self.assertTrue(summary.startswith(UNTRUSTED_DATA_START))
        self.assertIn("Audited symbols: 2", summary)
        self.assertLess(summary.index("parse_packet"), summary.index("clamp_len"))

    async def test_codenav_query_validates_commands_and_handles_missing_index(self):
        bad_cmd = codenav_query("exec-shell", "main")
        self.assertIn("unsupported codenav command", bad_cmd)

        fallback = codenav_query("callers", "parse_packet")
        # Without a Woboq refs/ dataset, codenav_query directs the agent to StructuralIndex tools.
        self.assertIn("get_function_boundary", fallback)

        # Create a minimal empty refs/ dir to verify flag/traversal guards before binary invocation.
        codenav_dir = Path(self.repo, ".codenav", "refs")
        codenav_dir.mkdir(parents=True, exist_ok=True)
        if resolve_codenav_binary():
            bad_arg = codenav_query("show", "--help")
            self.assertIn("invalid codenav argument", bad_arg)
            trav = codenav_query("show", "../etc/passwd")
            self.assertIn("invalid codenav argument", trav)


if __name__ == "__main__":
    unittest.main()

from __future__ import annotations

import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

HERE = Path(__file__).resolve().parent.parent
SRC = HERE / "src"
PYTHON = sys.executable

CHARTER_CONTENT = {
    "objective": "Wire the operator CLI",
    "deliverables": ["cli extension"],
    "acceptance": ["tests pass"],
    "stop_conditions": ["done"],
    "allowed_models": ["opencode/nemotron-3.5-super-vl-free"],
    "data_exceptions": [],
    "external_actions": [],
    "autonomy": "manual",
    "scope": {"include": ["src"], "exclude": []},
    "budgets": {
        "money": {"mode": "owner_unbounded"},
        "tokens": {"mode": "not_applicable"},
        "time": {"mode": "not_applicable"},
    },
    "workflow": {
        "method": "manual",
        "basis": "owner review",
        "method_status": "candidate",
        "steps": [{
            "id": "step-1",
            "objective": "wire cli",
            "responsibility": "owner",
            "failure_policy": "stop",
            "acceptance": ["ok"],
            "outputs": ["src/dai/cli.py"],
            "dependencies": [],
            "tools": [],
        }],
    },
}


class CommandTests(unittest.TestCase):
    def run_cli(self, root, *args, ok=True):
        env = dict(os.environ)
        env["PYTHONPATH"] = str(SRC)
        result = subprocess.run([PYTHON, "-m", "dai", "--data-root", str(root), *args],
                                capture_output=True, text=True, timeout=30, env=env)
        self.assertEqual(result.returncode, 0 if ok else 2, result.stderr)
        return json.loads(result.stdout if ok else result.stderr)

    def make_project(self, root, name="cli project", project_id="demo"):
        self.run_cli(root, "project", "create", name, "--id", project_id)
        return project_id

    def approve_charter(self, root, project):
        draft = self.run_cli(root, "charter", "--project", project, "propose",
                             "--json", json.dumps(CHARTER_CONTENT))
        self.assertEqual(draft["kind"], "charter_draft")
        self.assertEqual(draft["status"], "ACTIVE")
        assessment = self.run_cli(root, "charter", "--project", project, "assess", draft["id"])
        self.assertEqual(assessment["draft_id"], draft["id"])
        self.assertTrue(assessment["ready_for_approval"])
        approval = self.run_cli(root, "charter", "--project", project, "approve", draft["id"],
                                "--expected-version", "1")
        self.assertEqual(approval["draft_id"], draft["id"])
        self.assertEqual(approval["draft_version"], 1)
        active = self.run_cli(root, "charter", "--project", project, "active")
        self.assertEqual(active["kind"], "charter")
        self.assertEqual(approval["charter_id"], active["id"])
        return draft, active

    # ---- charter ----
    def test_charter_propose_assess_approve_active(self):
        with tempfile.TemporaryDirectory(prefix="dai-cmd-") as directory:
            root = Path(directory) / "state"
            project = self.make_project(root)
            self.approve_charter(root, project)

    # ---- task ----
    def test_task_full_lifecycle(self):
        with tempfile.TemporaryDirectory(prefix="dai-cmd-") as directory:
            root = Path(directory) / "state"
            project = self.make_project(root)
            _, active = self.approve_charter(root, project)
            task = self.run_cli(root, "task", "--project", project, "create",
                                "--objective", "verify the CLI wiring",
                                "--acceptance", "all green",
                                "--charter-id", active["id"],
                                "--responsibility", "owner")
            self.assertEqual(task["kind"], "task")
            self.assertEqual(task["content"]["state"], "DISCOVERING")
            shown = self.run_cli(root, "task", "--project", project, "show", task["id"])
            self.assertEqual(shown["id"], task["id"])
            listed = self.run_cli(root, "task", "--project", project, "list")
            self.assertGreaterEqual(len(listed), 1)
            updated = self.run_cli(root, "task", "--project", project, "state", task["id"],
                                   "--state", "READY", "--expected-version", "1")
            self.assertEqual(updated["content"]["state"], "READY")
            leased = self.run_cli(root, "task", "--project", project, "lease", task["id"],
                                  "--owner", "alice", "--ttl", "300")
            self.assertIsNotNone(leased["content"]["lease"])
            released = self.run_cli(root, "task", "--project", project, "release", task["id"],
                                    "--owner", "alice")
            self.assertIsNone(released["content"]["lease"])
            # COMPLETED is reachable only through a recorded successful attempt,
            # and only from a state whose declared transition map allows it.
            running = self.run_cli(root, "task", "--project", project, "state", task["id"],
                                   "--state", "RUNNING", "--expected-version", str(released["version"]))
            verifying = self.run_cli(root, "task", "--project", project, "state", task["id"],
                                     "--state", "VERIFYING", "--expected-version", str(running["version"]))
            attempted = self.run_cli(root, "task", "--project", project, "attempt", task["id"],
                                     "--attempt-id", "a1", "--outcome", "SUCCESS",
                                     "--receipt", "r1",
                                     "--expected-version", str(verifying["version"]))
            self.assertEqual(attempted["content"]["state"], "COMPLETED")
            graph = self.run_cli(root, "task", "--project", project, "graph")
            self.assertIn("nodes", graph)
            self.assertIn("edges", graph)

    # ---- decision ----
    def test_decision_record_list_supersede_withdraw_affected(self):
        with tempfile.TemporaryDirectory(prefix="dai-cmd-") as directory:
            root = Path(directory) / "state"
            project = self.make_project(root)
            d1 = self.run_cli(root, "decision", "--project", project, "record",
                              "--text", "use SQLite",
                              "--meaning", "local durable state",
                              "--authorization-source", "owner",
                              "--affects", "payroll",
                              "--affects", "ledger")
            self.assertEqual(d1["kind"], "decision")
            self.assertEqual(d1["content"]["state"], "ACTIVE")
            active = self.run_cli(root, "decision", "--project", project, "list")
            self.assertGreaterEqual(len(active), 1)
            affected = self.run_cli(root, "decision", "--project", project, "affected", "--unit", "payroll")
            self.assertGreaterEqual(len(affected), 1)
            d2 = self.run_cli(root, "decision", "--project", project, "supersede", d1["id"],
                              "--text", "use SQLite with WAL",
                              "--authorization-source", "owner",
                              "--expected-version", "1")
            self.assertEqual(d2["content"]["state"], "ACTIVE")
            self.assertEqual(d2["content"]["supersedes"], d1["id"])
            withdrawn = self.run_cli(root, "decision", "--project", project, "withdraw", d2["id"],
                                     "--reason", "reconsidered",
                                     "--expected-version", "1")
            self.assertEqual(withdrawn["content"]["state"], "WITHDRAWN")
            active_after = self.run_cli(root, "decision", "--project", project, "list")
            self.assertEqual(active_after, [])

    # ---- team ----
    def test_team_agents_tree_assign_message_inbox_acknowledge(self):
        with tempfile.TemporaryDirectory(prefix="dai-cmd-") as directory:
            root = Path(directory) / "state"
            project = self.make_project(root)
            team = self.run_cli(root, "team", "--project", project, "create",
                                "--name", "engineering", "--roles", "lead", "--roles", "dev")
            self.assertEqual(team["kind"], "team")
            agent = self.run_cli(root, "team", "--project", project, "add-agent", "--team", team["id"],
                                 "--agent-id", "a1", "--role", "dev", "--model", "demo-model")
            self.assertEqual(agent["agent_id"], "a1")
            self.assertEqual(agent["role"], "dev")
            agents = self.run_cli(root, "team", "--project", project, "agents", "--team", team["id"])
            self.assertEqual(len(agents), 1)
            self.assertEqual(agents[0]["agent_id"], "a1")
            tree = self.run_cli(root, "team", "--project", project, "tree", "--team", team["id"])
            self.assertEqual(tree["team"], team["id"])
            assigned = self.run_cli(root, "team", "--project", project, "assign", "--team", team["id"],
                                    "--agent-id", "a1", "--task-id", "t-1")
            self.assertEqual(assigned["agent_id"], "a1")
            self.assertEqual(assigned["task_id"], "t-1")
            message = self.run_cli(root, "team", "--project", project, "message",
                                   "--from-agent", "a1", "--to-agent", "a1", "--body", "ping")
            self.assertEqual(message["content"]["status"], "SENT")
            inbox = self.run_cli(root, "team", "--project", project, "inbox", "--agent-id", "a1")
            self.assertGreaterEqual(len(inbox), 1)
            msg_id = inbox[0]["id"]
            acked = self.run_cli(root, "team", "--project", project, "acknowledge", msg_id,
                                 "--status", "ACKNOWLEDGED", "--expected-version", "1")
            self.assertEqual(acked["content"]["status"], "ACKNOWLEDGED")

    # ---- consultation ----
    def test_consultation_open_reply_status_list(self):
        with tempfile.TemporaryDirectory(prefix="dai-cmd-") as directory:
            root = Path(directory) / "state"
            project = self.make_project(root)
            consultation = self.run_cli(root, "consultation", "--project", project, "open",
                                        "--parent-session", "sess-1",
                                        "--question", "which model for routing?",
                                        "--mode", "ask")
            self.assertEqual(consultation["kind"], "consultation")
            self.assertEqual(consultation["content"]["status"], "OPEN")
            replied = self.run_cli(root, "consultation", "--project", project, "reply", consultation["id"],
                                   "--body", "use opencode/nemotron-3.5-super-vl-free")
            self.assertEqual(replied["content"]["answer"], "use opencode/nemotron-3.5-super-vl-free")
            statused = self.run_cli(root, "consultation", "--project", project, "status", consultation["id"],
                                    "--status", "RECEIVED",
                                    "--expected-version", str(replied["version"]))
            self.assertEqual(statused["content"]["status"], "RECEIVED")
            stale = self.run_cli(root, "consultation", "--project", project, "status", consultation["id"],
                                 "--status", "MERGING", "--expected-version", "1", ok=False)
            self.assertEqual(stale["error"], "Conflict")
            listed = self.run_cli(root, "consultation", "--project", project, "list",
                                  "--parent-session", "sess-1")
            self.assertGreaterEqual(len(listed), 1)

    # ---- model ----
    def test_model_register_list_route_choose_meter_usage(self):
        with tempfile.TemporaryDirectory(prefix="dai-cmd-") as directory:
            root = Path(directory) / "state"
            project = self.make_project(root)
            registered = self.run_cli(root, "model", "--project", project, "register",
                                      "--model-id", "opencode/nemotron-3.5-super-vl-free",
                                      "--provider", "opencode",
                                      "--capabilities", "chat",
                                      "--cost-input-per-1k", "0.5",
                                      "--cost-basis", "estimated",
                                      "--availability", "available")
            self.assertEqual(registered["kind"], "model")
            catalog = self.run_cli(root, "model", "--project", project, "list")
            self.assertGreaterEqual(len(catalog), 1)
            routed = self.run_cli(root, "model", "--project", project, "route",
                                  "--task-class", "chat")
            self.assertEqual(routed["model"], "opencode/nemotron-3.5-super-vl-free")
            self.assertFalse(routed["needs_decision"])
            chosen = self.run_cli(root, "model", "--project", project, "choose",
                                  "--model-id", "opencode/nemotron-3.5-super-vl-free",
                                  "--role", "chat", "--reason", "owner selected",
                                  "--task-class", "chat")
            self.assertEqual(chosen["kind"], "model")
            metered = self.run_cli(root, "model", "--project", project, "meter",
                                   "--model-id", "opencode/nemotron-3.5-super-vl-free",
                                   "--task-class", "chat",
                                   "--input-tokens", "100", "--output-tokens", "20",
                                   "--cache-tokens", "0",
                                   "--cost", "0.05", "--cost-basis", "measured")
            self.assertEqual(metered["model_id"], "opencode/nemotron-3.5-super-vl-free")
            self.assertEqual(metered["cost_basis"], "measured")
            self.assertEqual(metered["input_tokens"], 100)
            self.assertIsNotNone(metered["seq"])
            usage = self.run_cli(root, "model", "--project", project, "usage")
            self.assertIn("actual", usage)
            self.assertIn("estimated", usage)
            self.assertIn("unknown", usage)
            self.assertGreater(usage["actual"]["records"], 0)

    # ---- tool ----
    def test_tool_register_list_resolve_invoke(self):
        with tempfile.TemporaryDirectory(prefix="dai-cmd-") as directory:
            root = Path(directory) / "state"
            project = self.make_project(root)
            registered = self.run_cli(root, "tool", "--project", project, "register",
                                      "--tool-id", "fs.read",
                                      "--systems", "cli",
                                      "--effect", "read",
                                      "--provider", "local")
            self.assertEqual(registered["kind"], "tool")
            catalog = self.run_cli(root, "tool", "--project", project, "list")
            self.assertGreaterEqual(len(catalog), 1)
            resolved = self.run_cli(root, "tool", "--project", project, "resolve",
                                    "--tool-id", "fs.read", "--system", "cli", "--action", "read")
            self.assertTrue(resolved["allowed"])
            self.assertEqual(resolved["source"], "owner-policy")
            invoked = self.run_cli(root, "tool", "--project", project, "invoke",
                                   "--tool-id", "fs.read", "--system", "cli", "--action", "read")
            self.assertEqual(invoked["status"], "AUTHORIZED")
            self.assertFalse(invoked.get("idempotent"))

    # ---- component ----
    def test_component_propose_decide_adopt_list_verify_import(self):
        with tempfile.TemporaryDirectory(prefix="dai-cmd-") as directory:
            root = Path(directory) / "state"
            project = self.make_project(root)
            proposed = self.run_cli(root, "component", "--project", project, "propose",
                                    "--source-url", "https://github.com/owner/repo",
                                    "--name", "example-component",
                                    "--license", "MIT",
                                    "--patterns", "repository-adoption-pattern")
            self.assertEqual(proposed["kind"], "component")
            self.assertIsNone(proposed["content"]["decision"])
            decided = self.run_cli(root, "component", "--project", project, "decide", proposed["id"],
                                   "--decision", "REFERENCE_ONLY",
                                   "--rationale", "licence reviewed by owner",
                                   "--expected-version", "1")
            self.assertEqual(decided["content"]["decision"], "REFERENCE_ONLY")
            adopted = self.run_cli(root, "component", "--project", project, "adopt", proposed["id"],
                                   "--capability-id", "cli.wiring",
                                   "--bindings", '{"task":"task","component.registry":"component.registry"}',
                                   "--files", "src/dai/cli.py",
                                   "--verification", "files present and importable",
                                   "--expected-version", "2")
            self.assertEqual(adopted["content"]["capability_id"], "cli.wiring")
            catalog = self.run_cli(root, "component", "--project", project, "list")
            self.assertGreaterEqual(len(catalog), 1)
            verified = self.run_cli(root, "component", "--project", project, "verify", proposed["id"])
            self.assertTrue(verified["ok"])
            self.assertEqual(verified["missing"], [])
            manifest = Path(directory) / "manifest.json"
            manifest.write_text(json.dumps({"components": [{
                "id": "imported-component",
                "source": "https://github.com/other/repo",
                "patterns": ["manifest-import-pattern"],
                "license": "Apache-2.0",
            }]}), encoding="utf-8")
            imported = self.run_cli(root, "component", "--project", project, "import",
                                    "--manifest", str(manifest))
            self.assertEqual(len(imported), 1)
            self.assertEqual(imported[0]["content"]["name"], "imported-component")

    # ---- update ----
    def test_update_status_plan_decide_apply_rollback(self):
        with tempfile.TemporaryDirectory(prefix="dai-cmd-") as directory:
            root = Path(directory) / "state"
            project = self.make_project(root)
            status = self.run_cli(root, "update", "status")
            self.assertIn("last_success", status)
            self.assertIn("due", status)
            planned = self.run_cli(root, "update", "--project", project, "plan",
                                   "--source", "https://github.com/owner/repo",
                                   "--version", "1.1.0", "--commit", "abc123",
                                   "--diff", "cli wiring", "--impact", "new commands")
            self.assertEqual(planned["kind"], "update")
            self.assertEqual(planned["content"]["state"], "PENDING")
            decided = self.run_cli(root, "update", "--project", project, "decide", planned["id"],
                                   "--decision", "update", "--expected-version", "1")
            self.assertEqual(decided["content"]["decision"], "update")
            applied = self.run_cli(root, "update", "--project", project, "apply", planned["id"],
                                   "--expected-version", "2")
            self.assertEqual(applied["content"]["state"], "APPLIED")
            rolled = self.run_cli(root, "update", "--project", project, "rollback", planned["id"],
                                  "--expected-version", "3")
            self.assertEqual(rolled["content"]["state"], "ROLLED_BACK")

    # ---- cross-cutting ----
    def test_project_only_command_requires_project(self):
        with tempfile.TemporaryDirectory(prefix="dai-cmd-") as directory:
            root = Path(directory) / "state"
            error = self.run_cli(root, "task", "list", ok=False)
            self.assertEqual(error["error"], "InvalidRequest")
            self.assertIn("project", error["message"].lower())
            self.assertIn("--project", error["message"])

    def test_unknown_record_id_is_json_error_not_traceback(self):
        with tempfile.TemporaryDirectory(prefix="dai-cmd-") as directory:
            root = Path(directory) / "state"
            self.make_project(root)
            error = self.run_cli(root, "task", "show", "--project", "demo", "does-not-exist", ok=False)
            self.assertEqual(error["error"], "NotFound")
            self.assertNotIn("Traceback", error["message"])
            error = self.run_cli(root, "charter", "active", "--project", "demo", ok=False)
            self.assertEqual(error["error"], "NotFound")

    def test_existing_project_memory_list_flow_still_works(self):
        with tempfile.TemporaryDirectory(prefix="dai-cmd-") as directory:
            root = Path(directory) / "state"
            self.run_cli(root, "project", "create", "بحث علمي", "--id", "study")
            item = self.run_cli(root, "memory", "--project", "study", "create",
                                "--json", '{"text":"قرار موثق"}')
            read = self.run_cli(root, "memory", "--project", "study", "get", item["id"])
            self.assertEqual(read["content"]["text"], "قرار موثق")
            self.assertEqual(len(self.run_cli(root, "project", "list")), 1)

    def test_permanent_purge_without_tty_deletes_nothing(self):
        with tempfile.TemporaryDirectory(prefix="dai-cmd-") as directory:
            root = Path(directory) / "state"
            self.run_cli(root, "project", "create", "Disposable test", "--id", "study")
            item = self.run_cli(root, "memory", "--project", "study", "create",
                                "--json", '{"text":"keep"}')
            error = self.run_cli(root, "memory", "--project", "study", "purge", item["id"],
                                 "--version", "1", ok=False)
            self.assertEqual(error["error"], "InvalidRequest")
            self.assertEqual(self.run_cli(root, "memory", "--project", "study", "get",
                                          item["id"])["content"]["text"], "keep")


if __name__ == "__main__":
    unittest.main()

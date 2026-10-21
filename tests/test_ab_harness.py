"""Tests for the A/B comparison harness: scorer, tests and harness contract.

Real tests, no network and no host run. The reviewer host invocation
(ab_score.run_reviewer) is monkeypatched so no OpenCode session is ever
started, and the harness host invocation (ab_compare.run_host / debug_paths)
is monkeypatched when run_repeat is exercised, so the OpenCode host is never
invoked here. The real functions from scripts/ab_score.py and
scripts/ab_compare.py are imported and tested.
"""

from __future__ import annotations

import hashlib
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ROOT / "scripts"
sys.path.insert(0, str(SCRIPTS))
sys.path.insert(0, str(ROOT / "src"))

import ab_compare  # noqa: E402
import ab_score  # noqa: E402

TASK = ROOT / "docs" / "evaluation" / "REFERENCE_TASK_SCI.md"
MODEL = "prov/model"
TASK_TEXT = "review the attached change and report findings"
TASK_SHA256 = hashlib.sha256(TASK_TEXT.encode("utf-8")).hexdigest()
FAKE_PROC = SimpleNamespace(returncode=0, stdout="", stderr="")


def _write_run_dir(run_dir, label_a="baseline", label_b="system"):
    """Create a minimal run directory: blind map, run.json, both arm outputs."""
    run_dir = Path(run_dir)
    blind = {
        "schema": "blind-map-v1",
        "randomized": True,
        "seed": "test-seed",
        "repeats": {"1": {"A": label_a, "B": label_b}},
    }
    (run_dir / "blind-map.json").write_text(json.dumps(blind), encoding="utf-8")
    run = {
        "schema": "run-manifest-v1",
        "task": str(TASK),
        "task_sha256": "x",
        "model_requested": "prov/model",
        "timeout_seconds": 900,
        "repeats": 1,
        "reverse": False,
        "blind_map": str(run_dir / "blind-map.json"),
        "repeats_records": [],
    }
    (run_dir / "run.json").write_text(json.dumps(run), encoding="utf-8")
    (run_dir / "baseline-1.json").write_text(
        json.dumps({"assistant_text": "baseline output text", "tool_calls": []}),
        encoding="utf-8",
    )
    (run_dir / "system-1.json").write_text(
        json.dumps({"assistant_text": "system output text", "tool_calls": []}),
        encoding="utf-8",
    )
    return run_dir


def _valid_reviewer_output():
    scores = {f"C{i}": {"score": i % 5, "evidence": f"evidence for C{i}"} for i in range(1, 8)}
    gates = {f"G{i}": {"passed": True, "evidence": f"evidence for G{i}"} for i in range(1, 7)}

    def arm(weighted):
        return {"scores": scores, "gates": gates, "weighted_score": weighted,
                "not_applicable": []}

    return json.dumps({"A": arm(60.0), "B": arm(60.0)})


class TaskTextTests(unittest.TestCase):
    def test_task_text_is_read_verbatim(self):
        raw = TASK.read_bytes()
        raw_out, sha, _sent = ab_compare.read_task_text(TASK)
        self.assertEqual(raw_out, raw)
        self.assertEqual(sha, hashlib.sha256(raw).hexdigest())


class SandboxTests(unittest.TestCase):
    def test_system_and_baseline_workspaces_differ_only_in_dai_definitions(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            base_paths, base_report = ab_compare.build_sandbox(root, "baseline", 1)
            sys_paths, sys_report = ab_compare.build_sandbox(root, "system", 1)

            base_files = ab_compare.workspace_files(base_paths.workspace)
            sys_files = ab_compare.workspace_files(sys_paths.workspace)

            # The baseline arm's workspace gets nothing.
            self.assertEqual(base_files, [])
            self.assertFalse((base_paths.workspace / ".opencode").exists())
            self.assertFalse((base_paths.workspace / "opencode.json").exists())
            self.assertEqual(base_report["mcp"]["action"], "absent")
            self.assertIsNone(base_report["mcp"]["entry"])

            # The system arm's workspace receives the D_AI definitions and the
            # MCP registration only.
            self.assertTrue((sys_paths.workspace / ".opencode" / "agent").is_dir())
            self.assertTrue((sys_paths.workspace / ".opencode" / "skill").is_dir())
            self.assertTrue((sys_paths.workspace / ".opencode" / "command").is_dir())
            self.assertTrue((sys_paths.workspace / "opencode.json").is_file())
            added = set(sys_files) - set(base_files)
            self.assertTrue(
                all(p.startswith(".opencode/") or p == "opencode.json" for p in added),
                f"unexpected non-D_AI files in system workspace: {added}",
            )
            dai_defs = [p for p in sys_files if p.startswith(".opencode/")]
            self.assertTrue(dai_defs, "system workspace should install D_AI definitions")

            contents = ab_compare.workspace_contents(sys_paths.workspace)
            self.assertTrue(contents["agent"], "system sandbox should install agents")
            self.assertTrue(contents["skill"], "system sandbox should install skills")
            self.assertTrue(contents["command"], "system sandbox should install commands")
            self.assertTrue(contents["opencode_json"])

            # The MCP entry is in the workspace opencode.json, with a
            # per-arm DAI_DATA_ROOT, never in the isolated global config.
            document = json.loads((sys_paths.workspace / "opencode.json").read_text(
                encoding="utf-8"))
            entry = document["mcp"]["servers"]["dai"]
            self.assertEqual(entry["command"], [sys.executable, "-m", "dai.mcp_server"])
            env = entry["environment"]
            self.assertEqual(env["DAI_PROJECT_ROOT"], str(ab_compare.ROOT))
            self.assertEqual(env["PYTHONPATH"], str(ab_compare._SRC))
            self.assertEqual(env["DAI_DATA_ROOT"], str(sys_paths.data))
            self.assertEqual(sys_report["mcp"]["entry"]["environment"]["DAI_DATA_ROOT"],
                             str(sys_paths.data))
            self.assertNotEqual(str(sys_paths.data), str(base_paths.data))

            # Data roots are unique per arm and per repeat.
            sys_paths_2, _ = ab_compare.build_sandbox(root, "system", 2)
            self.assertNotEqual(sys_paths.data, sys_paths_2.data)
            self.assertNotEqual(sys_paths.home, sys_paths_2.home)


class IsolationEnvTests(unittest.TestCase):
    def test_arm_env_is_isolated_from_parent_and_data_home_shared(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            base_paths, _ = ab_compare.build_sandbox(root, "baseline", 1)
            sys_paths, _ = ab_compare.build_sandbox(root, "system", 1)
            real_home = os.environ.get("HOME")
            real_data = os.environ.get("XDG_DATA_HOME")

            for paths in (base_paths, sys_paths):
                env = ab_compare.host_env(paths)
                # Per-arm sandbox locations.
                self.assertEqual(env["HOME"], str(paths.home))
                self.assertEqual(env["XDG_STATE_HOME"], str(paths.state))
                self.assertEqual(env["XDG_CONFIG_HOME"], str(paths.config))
                self.assertEqual(env["XDG_CACHE_HOME"], str(paths.cache))
                self.assertEqual(env["OPENCODE_CONFIG_DIR"], str(paths.opencode_config))
                self.assertEqual(paths.config, paths.home / ".config")
                # XDG_DATA_HOME is unchanged from the real environment.
                self.assertEqual(env.get("XDG_DATA_HOME"), real_data)
                # The environment is not the parent's unchanged environment.
                self.assertNotEqual(env["HOME"], real_home)
                self.assertNotEqual(env, os.environ)

            # Per-arm values differ between arms; the shared value agrees.
            base_env = ab_compare.host_env(base_paths)
            sys_env = ab_compare.host_env(sys_paths)
            self.assertNotEqual(base_env["HOME"], sys_env["HOME"])
            self.assertNotEqual(base_env["state"] if False else base_env["XDG_STATE_HOME"],
                                sys_env["XDG_STATE_HOME"])
            self.assertEqual(base_env.get("XDG_DATA_HOME"),
                            sys_env.get("XDG_DATA_HOME"))


class BlindMapTests(unittest.TestCase):
    def test_blind_map_is_randomised_and_maps_both_labels(self):
        blind = ab_compare.random_blind_map(3)
        self.assertTrue(blind["randomized"])
        for repeat, mapping in blind["repeats"].items():
            self.assertEqual(set(mapping.keys()), {"A", "B"})
            self.assertEqual(set(mapping.values()), {"baseline", "system"})
            self.assertNotEqual(mapping["A"], mapping["B"],
                                f"repeat {repeat} collapsed A and B to one arm")


class ScorerTests(unittest.TestCase):
    def test_scorer_refuses_without_blind_map(self):
        with tempfile.TemporaryDirectory() as directory:
            run_dir = Path(directory)
            (run_dir / "run.json").write_text("{}", encoding="utf-8")
            rc = ab_score.main(["--run", str(run_dir), "--model", "prov/model"])
            self.assertNotEqual(rc, 0, "scoring without a blind map must fail")

    def test_scorer_scoring_failed_on_unparseable_without_unblinding(self):
        with tempfile.TemporaryDirectory() as directory:
            run_dir = _write_run_dir(directory)
            fake = {"stdout": "this is not json", "stderr": "", "exit_code": 0,
                    "duration_seconds": 1.0}
            with patch.object(ab_score, "run_reviewer", return_value=fake):
                rc = ab_score.main(["--run", str(run_dir), "--model", "prov/model"])
            self.assertNotEqual(rc, 0)
            scores = json.loads((run_dir / "scores.json").read_text(encoding="utf-8"))
            self.assertEqual(scores["status"], "SCORING_FAILED")
            self.assertIn("raw", scores)
            md = (run_dir / "SCORES.md").read_text(encoding="utf-8")
            self.assertIn("SCORING_FAILED", md)
            self.assertNotIn("unblinded", scores)

    def test_scorer_publishes_negative_and_zero_differences(self):
        # A=baseline, B=system. System weaker on C1 (3 vs 4 => -1), equal on C2 (2 vs 2 => 0).
        def arm(c1, c2):
            scores = {f"C{i}": {"score": 2, "evidence": f"e C{i}"} for i in range(1, 8)}
            scores["C1"] = {"score": c1, "evidence": "e C1"}
            scores["C2"] = {"score": c2, "evidence": "e C2"}
            gates = {f"G{i}": {"passed": True, "evidence": f"e G{i}"} for i in range(1, 7)}
            return {"scores": scores, "gates": gates,
                    "weighted_score": 50.0, "not_applicable": []}

        output = json.dumps({"A": arm(4, 2), "B": arm(3, 2)})
        fake = {"stdout": output, "stderr": "", "exit_code": 0, "duration_seconds": 1.2}

        with tempfile.TemporaryDirectory() as directory:
            run_dir = _write_run_dir(directory, label_a="baseline", label_b="system")
            with patch.object(ab_score, "run_reviewer", return_value=fake):
                rc = ab_score.main(["--run", str(run_dir), "--model", "prov/model"])
            self.assertEqual(rc, 0)
            scores = json.loads((run_dir / "scores.json").read_text(encoding="utf-8"))
            self.assertEqual(scores["status"], "OK")
            md = (run_dir / "SCORES.md").read_text(encoding="utf-8")
            diff_c1 = scores["repeats"][0]["differences"]["C1"]["diff"]
            diff_c2 = scores["repeats"][0]["differences"]["C2"]["diff"]
            self.assertEqual(diff_c1, -1)   # negative difference published
            self.assertEqual(diff_c2, 0)    # zero difference
            self.assertIn("-1", md)
            self.assertIn("Zero difference", md)
            self.assertIn("Negative differences are published as-is", md)

    def test_weighted_score_failed_gate_zeroes_its_criterion(self):
        scores = {c: ab_score.CriterionScore(4, "e") for c in ab_score.CRITERIA}
        gates_all = {g: ab_score.GateResult(True, "e") for g in ab_score.GATES}
        self.assertEqual(ab_score.compute_weighted_score(scores, gates_all), 100.0)

        gates = dict(gates_all)
        gates["G1"] = ab_score.GateResult(False, "e")  # G1 -> C1, weight 5
        weighted = ab_score.compute_weighted_score(scores, gates)
        expected = round(
            4 * sum(ab_score.WEIGHTS[c] for c in ab_score.CRITERIA if c != "C1")
            / ab_score.MAX_WEIGHTED * 100, 2)
        self.assertEqual(weighted, expected)
        self.assertLess(weighted, 100.0)


class HarnessDryRunTests(unittest.TestCase):
    def test_dry_run_builds_sandboxes_and_writes_plan_without_host(self):
        with tempfile.TemporaryDirectory() as directory:
            out_dir = Path(directory) / "run"
            rc = ab_compare.run_compare(TASK, MODEL, out_dir, 900.0,
                                        False, True, False, 1)
            self.assertEqual(rc, 0)
            plan = json.loads((out_dir / "plan.json").read_text(encoding="utf-8"))
            self.assertEqual(plan["schema"], "dry-run-plan-v1")
            self.assertEqual(plan["note"], "no host was invoked")
            self.assertEqual(len(plan["sandboxes"]), 2)  # baseline + system


class RepeatHostTests(unittest.TestCase):
    """run_repeat with the host subprocess monkeypatched: no OpenCode session."""

    def _run_repeat_mocked(self, mapping, reverse=False):
        run_calls = []

        def fake_run(cmd, cwd=None, env=None, capture_output=True, text=True,
                     timeout=None):
            run_calls.append({"cmd": list(cmd), "cwd": cwd, "env": dict(env or {})})
            return FAKE_PROC

        with patch.object(ab_compare.subprocess, "run", side_effect=fake_run), \
                patch.object(ab_compare, "debug_paths",
                             return_value={"observable": True, "exit_code": 0,
                                           "stdout": "debug paths out", "stderr": ""}):
            record, reports = ab_compare.run_repeat(1, TASK_TEXT, TASK_SHA256, MODEL,
                                                    Path(tempfile.mkdtemp()), 900.0,
                                                    reverse, mapping, False)
        return record, reports, run_calls

    def test_repeat_runs_both_arms_with_isolated_env_and_correct_flags(self):
        mapping = {"1": {"A": "baseline", "B": "system"}}
        record, reports, calls = self._run_repeat_mocked(mapping)

        run_calls = [c for c in calls if c["cmd"][1] == "run"]
        self.assertEqual(len(run_calls), 3,
                         f"expected 3 host run calls, got {len(run_calls)}")

        required_prefix = ["run", "--standalone", "--auto", "--format", "json", "--model"]
        baseline_real = None
        baseline_probe = None
        system_real = None
        for call in run_calls:
            cmd = call["cmd"]
            self.assertEqual(cmd[0], ab_compare.OPENCODE)
            self.assertEqual(cmd[1:7], required_prefix)
            self.assertEqual(cmd[-1], TASK_TEXT)
            parts = Path(call["cwd"]).parts
            self.assertIn("workspace", parts)
            env = call["env"]
            self.assertEqual(env.get("XDG_DATA_HOME"), os.environ.get("XDG_DATA_HOME"))
            self.assertEqual(Path(env["HOME"]).name, "home")
            self.assertEqual(Path(env["HOME"]).parent.name, "repeat-1")
            self.assertEqual(Path(env["XDG_CONFIG_HOME"]).name, ".config")
            self.assertEqual(Path(env["XDG_CACHE_HOME"]).name, "cache")
            self.assertEqual(Path(env["XDG_STATE_HOME"]).name, "state")
            if "baseline" in parts:
                arm_dir = "baseline"
            elif "system" in parts:
                arm_dir = "system"
            else:
                self.fail(f"unknown arm workspace: {call['cwd']}")
            if "--agent" not in cmd:
                self.assertIsNone(baseline_real, "two agentless run calls?")
                self.assertEqual(arm_dir, "baseline")
                baseline_real = call
            else:
                agent_idx = cmd.index("--agent")
                self.assertEqual(cmd[agent_idx:agent_idx + 2],
                                 ["--agent", "dai-research"])
                if arm_dir == "baseline":
                    self.assertIsNone(baseline_probe, "two baseline probe calls?")
                    baseline_probe = call
                else:
                    self.assertIsNone(system_real, "two system run calls?")
                    system_real = call

        self.assertIsNotNone(baseline_real)
        self.assertIsNotNone(baseline_probe)
        self.assertIsNotNone(system_real)
        self.assertNotEqual(Path(baseline_real["cwd"]).parent.parent,
                            Path(system_real["cwd"]).parent.parent)

    def test_baseline_probe_is_recorded_but_not_the_real_result(self):
        mapping = {"1": {"A": "baseline", "B": "system"}}
        record, _reports, calls = self._run_repeat_mocked(mapping)

        baseline = record["arms"]["baseline"]
        system = record["arms"]["system"]

        # Blind labels map in both directions for this repeat.
        self.assertEqual(baseline["label"], "A")
        self.assertEqual(system["label"], "B")

        # The probe is recorded as an "Agent not found" expectation...
        self.assertIn("probe", baseline["isolation"])
        probe = baseline["isolation"]["probe"]
        self.assertEqual(probe["agent"], "dai-research")
        self.assertEqual(probe["expected"], 'Agent not found: "dai-research"')
        self.assertEqual(probe["status"], "ok")  # host exited 0 in the mock
        self.assertIn("note", probe)
        self.assertIn("not the arm", probe["note"])

        # ...but it is NOT the arm's real result: the real baseline result is
        # the agentless run.
        self.assertEqual(baseline["status"], "ok")
        self.assertEqual(system["status"], "ok")
        self.assertEqual(system["isolation"]["agent_resolved"], True)
        self.assertEqual(system["isolation"]["agent"], "dai-research")
        self.assertNotIn("probe", system["isolation"])

        # Each arm recorded its sandbox environment and debug paths.
        for arm in ("baseline", "system"):
            iso = record["arms"][arm]["isolation"]
            self.assertIn("home", iso)
            self.assertIn("xdg_data_home", iso)
            self.assertIn("xdg_state_home", iso)
            self.assertIn("xdg_config_home", iso)
            self.assertIn("xdg_cache_home", iso)
            self.assertIn("workspace_contents", iso)
            self.assertIn("debug_paths", iso)
            self.assertNotEqual(iso["xdg_data_home"], iso["home"])


class HostLocationTests(unittest.TestCase):
    """The host resolves its location from PWD, not from getcwd().

    A stale PWD inherited from the parent shell makes the host read the agent
    catalog of the wrong directory and report an agent that exists as missing.
    The harness must therefore set PWD to the arm's workspace. This test locks
    that behaviour so a later change cannot break the comparison silently.
    """

    def test_environment_sets_pwd_to_the_arm_workspace(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            paths, _ = ab_compare.build_sandbox(root, "system", 1)
            env = ab_compare.host_env(paths)
            self.assertEqual(env["PWD"], str(paths.workspace))
            self.assertEqual(env["HOME"], str(paths.home))
            self.assertNotEqual(env["PWD"], str(paths.home))

    def test_the_two_arms_get_different_pwd(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            base_paths, _ = ab_compare.build_sandbox(root, "baseline", 1)
            sys_paths, _ = ab_compare.build_sandbox(root, "system", 1)
            self.assertNotEqual(ab_compare.host_env(base_paths)["PWD"],
                                ab_compare.host_env(sys_paths)["PWD"])


class OutputDirectoryTests(unittest.TestCase):
    """The run directory must be absolute.

    The host resolves its location from PWD, and a relative sandbox path makes
    it fail with "Failed to change directory to ...", which would be recorded
    as an arm failure rather than as a harness bug.
    """

    def test_a_relative_out_dir_is_resolved(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            relative = Path("relative-run")
            try:
                os.chdir(root)
                resolved = relative.resolve()
            finally:
                os.chdir(ROOT)
            self.assertTrue(resolved.is_absolute())
            self.assertTrue(str(resolved).startswith(str(root)))

    def test_the_harness_resolves_the_out_dir_in_main(self):
        source = (ROOT / "scripts" / "ab_compare.py").read_text(encoding="utf-8")
        self.assertIn("out_dir.resolve()", source)


if __name__ == "__main__":
    unittest.main()

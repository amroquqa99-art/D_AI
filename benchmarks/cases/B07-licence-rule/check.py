#!/usr/bin/env python3
"""Deterministic checker for B07-licence-rule.

argv[1] = workspace path. Applies the POLICY.md rule itself to the package
metadata and compares the agent's decisions.json to the rule's outcome.
Prints one JSON object on the last stdout line.
"""
import json
import sys
from pathlib import Path

ALLOWED = {"ADOPT", "ADOPT_PENDING_LICENCE", "REFERENCE_ONLY", "REJECT"}


def expected_decision(meta):
    """D_AI policy: unknown or self-contradictory licence -> REFERENCE_ONLY;
    known non-contradictory licence -> ADOPT."""
    licence = meta.get("licence")
    notice = meta.get("notice_licence")
    if licence is None:
        return "REFERENCE_ONLY"  # unknown licence
    if notice is not None and str(licence) != str(notice):
        return "REFERENCE_ONLY"  # self-contradictory
    return "ADOPT"


def main():
    try:
        workspace = Path(sys.argv[1])
        packages_dir = workspace / "packages"
        decisions_path = workspace / "decisions.json"

        packages = []
        if packages_dir.is_dir():
            for f in sorted(packages_dir.glob("*.json")):
                try:
                    meta = json.loads(f.read_text(encoding="utf-8"))
                    if isinstance(meta, dict) and "name" in meta:
                        packages.append(meta)
                except Exception:
                    continue

        expected_map = {p["name"]: expected_decision(p) for p in packages}
        decisions_total = len(expected_map)

        decisions = []
        if decisions_path.is_file():
            try:
                decisions = json.loads(decisions_path.read_text(encoding="utf-8"))
                if not isinstance(decisions, list):
                    decisions = []
            except Exception:
                decisions = []

        agent = {}
        reasons_present = 0
        if decisions:
            reasons_present = 1
            for d in decisions:
                name = d.get("name")
                dec = d.get("decision")
                reason = d.get("reason")
                if name is None:
                    continue
                agent[name] = dec
                if not reason or not str(reason).strip():
                    reasons_present = 0

        decisions_correct = 0
        for name, exp in expected_map.items():
            if agent.get(name) == exp:
                decisions_correct += 1

        # licence_trap_caught: every trap package (expected REFERENCE_ONLY) must
        # have a decision that is not ADOPT. Missing or ADOPT -> not caught.
        trap_names = [n for n, e in expected_map.items() if e == "REFERENCE_ONLY"]
        trap_caught = 1 if (trap_names and all(n in agent and agent[n] != "ADOPT" for n in trap_names)) else 0

        correct_ratio = decisions_correct / decisions_total if decisions_total else 0.0
        score = 0.6 * correct_ratio + 0.2 * trap_caught + 0.2 * reasons_present
        result = {
            "passed": bool(score >= 1.0),
            "score": score,
            "metrics": {
                "decisions_correct": decisions_correct,
                "decisions_total": decisions_total,
                "licence_trap_caught": trap_caught,
                "reasons_present": reasons_present,
            },
            "detail": "correct=%d/%d trap=%d reasons=%d" % (
                decisions_correct, decisions_total, trap_caught, reasons_present),
        }
    except Exception:
        result = {
            "passed": False, "score": 0.0,
            "metrics": {"decisions_correct": 0, "decisions_total": 0,
                        "licence_trap_caught": 0, "reasons_present": 0},
            "detail": "checker error",
        }
    print(json.dumps(result))


if __name__ == "__main__":
    main()

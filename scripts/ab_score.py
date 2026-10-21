#!/usr/bin/env python3
"""Independent blind scorer for the D_AI 0.1 A/B comparison harness.

Invariant: the scorer never learns which output is the baseline and which is
the system. Labels A/B are unblinded ONLY after scores.json and SCORES.md are
written. The scorer reports numbers only; it never claims the system is
better or worse. A failed gate zeroes its criterion's contribution to the
weighted score, exactly as the rubric prescribes.

Public CLI:
    python scripts/ab_score.py --run <run dir> --model provider/model \
        [--timeout 900] [--dry-run]
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import tempfile
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
_SRC = ROOT / "src"
if str(_SRC) not in sys.path:
    sys.path.insert(0, str(_SRC))

from dai.errors import DaiError, InvalidRequest  # noqa: E402

OPENCODE = os.path.expanduser("~/.opencode/bin/opencode")

RUBRIC_PATH = ROOT / "docs" / "evaluation" / "RUBRIC.md"

CRITERIA = ("C1", "C2", "C3", "C4", "C5", "C6", "C7")
GATES = ("G1", "G2", "G3", "G4", "G5", "G6")
WEIGHTS = {"C1": 5, "C2": 5, "C3": 4, "C4": 4, "C5": 3, "C6": 3, "C7": 2}
MAX_WEIGHTED = sum(WEIGHTS[c] for c in CRITERIA) * 4  # 26 * 4 = 104

# Gate -> criterion mapping. The rubric names the gates but does not prescribe
# a mapping; this is the semantic mapping used by this scorer and is documented
# in docs/evaluation/HARNESS.md.
GATE_TO_CRITERION = {
    "G1": "C1",  # fabricated source        -> source support
    "G2": "C1",  # unsupported claim        -> source support
    "G3": "C2",  # hypothesis as result     -> inference integrity
    "G4": "C2",  # fabricated result        -> inference integrity
    "G5": "C6",  # silent scope overreach   -> constraint adherence
    "G6": "C6",  # hiding failure           -> constraint adherence
}


class ScoringError(DaiError):
    """A scoring failure safe to present at the local protocol boundary."""


class ValidationError(ScoringError):
    """The reviewer output did not validate against the required shape."""


class ReviewerOutputInvalid(ValidationError):
    """The reviewer output could not be parsed or validated; carries the raw
    output so the caller can record it without unblinding any labels."""

    def __init__(self, message: str, raw: str):
        super().__init__(message)
        self.raw = raw


@dataclass
class CriterionScore:
    score: int
    evidence: str


@dataclass
class GateResult:
    passed: bool
    evidence: str


@dataclass
class ReviewerOutput:
    scores: dict[str, CriterionScore] = field(default_factory=dict)
    gates: dict[str, GateResult] = field(default_factory=dict)
    weighted_score: float = 0.0
    not_applicable: list[str] = field(default_factory=list)


# --------------------------------------------------------------------------- #
# Input loading                                                               #
# --------------------------------------------------------------------------- #


def read_rubric() -> str:
    """Read the rubric document so its criteria, weights and gates are inlined."""
    return RUBRIC_PATH.read_text(encoding="utf-8")


def load_run(run_dir: Path) -> dict[str, Any]:
    """Read blind-map.json and run.json.

    Refuses to score when the blind map is missing: a run directory without a
    blind map cannot be scored blind.
    """
    blind_path = run_dir / "blind-map.json"
    run_path = run_dir / "run.json"
    if not blind_path.is_file():
        raise InvalidRequest(
            "a run directory without a blind map cannot be scored blind: "
            f"{blind_path}"
        )
    if not run_path.is_file():
        raise InvalidRequest(f"run.json not found in run directory: {run_path}")
    blind = json.loads(blind_path.read_text(encoding="utf-8"))
    run = json.loads(run_path.read_text(encoding="utf-8"))
    return {"blind": blind, "run": run}


def arm_file(run_dir: Path, arm: str, repeat: int) -> Path:
    return run_dir / f"{arm}-{repeat}.json"


def load_arm_output(run_dir: Path, arm: str, repeat: int) -> dict[str, Any]:
    path = arm_file(run_dir, arm, repeat)
    if not path.is_file():
        raise InvalidRequest(f"arm output file not found: {path}")
    return json.loads(path.read_text(encoding="utf-8"))


def unblind(blind: dict[str, Any], repeat: int) -> dict[str, str]:
    """Return {"A": arm, "B": arm} for one repeat from the randomised blind map."""
    repeats = blind.get("repeats", {})
    mapping = repeats.get(str(repeat))
    if not mapping or "A" not in mapping or "B" not in mapping:
        raise InvalidRequest(f"no blind mapping for repeat {repeat}")
    return {"A": str(mapping["A"]), "B": str(mapping["B"])}


# --------------------------------------------------------------------------- #
# Reviewer prompt                                                             #
# --------------------------------------------------------------------------- #


def _format_tools(tools: list[dict[str, Any]]) -> str:
    """A bounded summary of the tool calls: name, status and a short preview.

    The full transcript can be hundreds of kilobytes, which does not fit in one
    command-line argument and is not what the rubric scores.
    """
    if not tools:
        return "none"
    lines: list[str] = []
    for call in tools[:MAX_TOOL_CALLS]:
        if not isinstance(call, dict):
            continue
        state = call.get("state") if isinstance(call.get("state"), dict) else {}
        status = state.get("status", "")
        preview = str(state.get("input", ""))[:MAX_TOOL_FIELD_CHARS]
        output = str(state.get("output", ""))[:MAX_TOOL_FIELD_CHARS]
        lines.append(f"- {call.get('tool', '?')} [{status}] in: {preview} | out: {output}")
    if len(tools) > MAX_TOOL_CALLS:
        lines.append(f"- ... and {len(tools) - MAX_TOOL_CALLS} more tool calls")
    return "\n".join(lines)



# The reviewer prompt travels as one command-line argument, so it must stay
# inside the operating system's argument limit. The answers are bounded and the
# tool calls are summarised: the rubric scores the ANSWER, and a full tool
# transcript is neither necessary nor fair to read.
MAX_OUTPUT_CHARS = 24000
MAX_TOOL_CALLS = 40
MAX_TOOL_FIELD_CHARS = 180


def _bound(text: str) -> str:
    """Keep the answer, and say plainly when it was cut."""
    value = str(text or "")
    if len(value) <= MAX_OUTPUT_CHARS:
        return value
    kept = value[:MAX_OUTPUT_CHARS]
    return (kept + "\n\n[the output was truncated for the reviewer after "
            f"{MAX_OUTPUT_CHARS} characters; the rest is not shown]")


def build_reviewer_prompt(rubric: str, output_a: str, tools_a: list[dict[str, Any]],
                          output_b: str, tools_b: list[dict[str, Any]]) -> str:
    """Build the reviewer prompt.

    The two outputs are labelled "output A" and "output B" in the randomised
    order taken from the blind map. The prompt contains only the rubric and
    the two outputs with their reported tool calls. It never contains an arm
    name, a duration, token counts, artifact counts, any mention of D_AI, the
    agent that ran, or any indication that a comparison is happening.
    """
    return (
        rubric
        + "\n\n---\n\n"
        + "Apply the rubric below to each output and return the JSON object specified.\n\n"
        + "Output A:\n"
        + _bound(output_a)
        + "\n\nReported tool calls (Output A):\n"
        + _format_tools(tools_a)
        + "\n\nOutput B:\n"
        + _bound(output_b)
        + "\n\nReported tool calls (Output B):\n"
        + _format_tools(tools_b)
        + "\n\nReturn exactly one JSON object with keys \"A\" and \"B\". Each arm:\n"
        + "{ \"scores\": { \"C1\": { \"score\": <integer 0-4>, "
        + "\"evidence\": \"<non-empty evidence line from the output>\" }, ... C7 }, "
        + "\"gates\": { \"G1\": { \"passed\": <true|false>, "
        + "\"evidence\": \"<...>\" }, ... G6 }, "
        + "\"weighted_score\": <number 0-100>, \"not_applicable\": [] }\n"
    )


# --------------------------------------------------------------------------- #
# Host invocation (reviewer in its own isolated sandbox)                      #
# --------------------------------------------------------------------------- #


def _reviewer_sandbox_dirs() -> tuple[Path, Path, Path, Path, Path, Path]:
    base = tempfile.gettempdir()
    if Path("/tmp/opencode").is_dir():
        base = "/tmp/opencode"
    workspace = Path(tempfile.mkdtemp(prefix="dai-reviewer-workspace-", dir=base))
    home = workspace / "home"            # HOME: isolated global configuration
    config = home / ".config"          # XDG_CONFIG_HOME
    opencode_config = config / "opencode"  # OPENCODE_CONFIG_DIR
    state = workspace / "state"        # XDG_STATE_HOME
    cache = workspace / "cache"        # XDG_CACHE_HOME
    for directory in (home, config, opencode_config, state, cache):
        directory.mkdir(parents=True, exist_ok=True)
    return home, config, opencode_config, state, cache, workspace


def run_reviewer(model: str, prompt: str, timeout: float) -> dict[str, Any]:
    """Run the reviewer through the host CLI in its own isolated sandbox.

    HOME = <workspace>/home, so the host's global configuration is isolated and
    the owner's global opencode.json (default agent, live MCP server) is not
    visible to the reviewer. XDG_DATA_HOME is deliberately left at the real
    value so provider authentication keeps working. XDG_STATE_HOME,
    XDG_CONFIG_HOME and XDG_CACHE_HOME point at the sandbox. cwd is a fresh
    empty workspace. Captures stdout, stderr, exit code and duration.
    """
    home, config, opencode_config, state, cache, workspace = _reviewer_sandbox_dirs()
    env = os.environ.copy()
    env["HOME"] = str(home)
    env["XDG_STATE_HOME"] = str(state)
    env["XDG_CONFIG_HOME"] = str(config)
    env["XDG_CACHE_HOME"] = str(cache)
    env["OPENCODE_CONFIG_DIR"] = str(opencode_config)
    # The host resolves its location from PWD, not from getcwd(); without this
    # the reviewer would read the wrong directory.
    env["PWD"] = str(workspace)
    cmd = [OPENCODE, "run", "--standalone", "--auto", "--format", "json",
           "--model", model, prompt]
    start = time.monotonic()
    exit_code: int | None = None
    stdout = ""
    stderr = ""
    try:
        proc = subprocess.run(
            cmd, cwd=str(workspace), env=env, capture_output=True, text=True,
            timeout=timeout)
        exit_code = proc.returncode
        stdout = proc.stdout or ""
        stderr = proc.stderr or ""
    except subprocess.TimeoutExpired as exc:
        exit_code = None
        stdout = _decode(exc.stdout)
        stderr = _decode(exc.stderr)
    except (OSError, subprocess.SubprocessError) as exc:
        exit_code = None
        stderr = str(exc)
    duration = time.monotonic() - start
    return {
        "stdout": stdout, "stderr": stderr, "exit_code": exit_code,
        "duration_seconds": round(duration, 3),
        "config_dir": str(opencode_config), "workspace": str(workspace),
    }


def _decode(value: Any) -> str:
    if isinstance(value, (bytes, bytearray)):
        return value.decode("utf-8", "replace")
    return value or ""


def _collect_text_events(stdout: str) -> str:
    parts: list[str] = []
    for line in stdout.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            event = json.loads(line)
        except ValueError:
            continue
        if isinstance(event, dict) and event.get("type") == "text":
            part = event.get("part")
            if isinstance(part, dict) and isinstance(part.get("text"), str):
                parts.append(part["text"])
    return "".join(parts)


def extract_reviewer_json(stdout: str) -> str:
    """Extract the reviewer's JSON answer from the host JSON-stream output."""
    text = stdout.strip()
    try:
        json.loads(text)
        return text
    except ValueError:
        pass
    extracted = _collect_text_events(stdout)
    if extracted.strip():
        return extracted.strip()
    raise ValidationError("reviewer output contained no parseable JSON")


# --------------------------------------------------------------------------- #
# Validation                                                                  #
# --------------------------------------------------------------------------- #


def _is_int(value: Any) -> bool:
    return isinstance(value, int) and not isinstance(value, bool)


def _parse_scores(scores: Any, label: str) -> dict[str, CriterionScore]:
    if not isinstance(scores, dict):
        raise ValidationError(f"arm {label} scores must be an object")
    parsed: dict[str, CriterionScore] = {}
    for crit in CRITERIA:
        entry = scores.get(crit)
        if not isinstance(entry, dict):
            raise ValidationError(f"arm {label} missing criterion {crit}")
        score = entry.get("score")
        evidence = entry.get("evidence")
        if not _is_int(score) or not (0 <= score <= 4):
            raise ValidationError(f"arm {label} {crit} score must be an integer 0-4")
        if not isinstance(evidence, str) or not evidence.strip():
            raise ValidationError(f"arm {label} {crit} evidence must be non-empty")
        parsed[crit] = CriterionScore(score=int(score), evidence=evidence.strip())
    return parsed


def _parse_gates(gates: Any, label: str) -> dict[str, GateResult]:
    if not isinstance(gates, dict):
        raise ValidationError(f"arm {label} gates must be an object")
    parsed: dict[str, GateResult] = {}
    for gate in GATES:
        entry = gates.get(gate)
        if not isinstance(entry, dict):
            raise ValidationError(f"arm {label} missing gate {gate}")
        passed = entry.get("passed")
        evidence = entry.get("evidence")
        if not isinstance(passed, bool):
            raise ValidationError(f"arm {label} {gate} passed must be a boolean")
        if not isinstance(evidence, str) or not evidence.strip():
            raise ValidationError(f"arm {label} {gate} evidence must be non-empty")
        parsed[gate] = GateResult(passed=bool(passed), evidence=evidence.strip())
    return parsed


def parse_reviewer_output(raw: str) -> dict[str, ReviewerOutput]:
    """Parse and validate the reviewer output against the required shape."""
    try:
        document = json.loads(raw)
    except ValueError as exc:
        raise ValidationError(f"reviewer output is not valid JSON: {exc}")
    if not isinstance(document, dict) or set(document.keys()) != {"A", "B"}:
        raise ValidationError("reviewer output must contain exactly the keys A and B")
    result: dict[str, ReviewerOutput] = {}
    for label in ("A", "B"):
        arm_doc = document[label]
        if not isinstance(arm_doc, dict):
            raise ValidationError(f"arm {label} is not an object")
        scores = _parse_scores(arm_doc.get("scores"), label)
        gates = _parse_gates(arm_doc.get("gates"), label)
        weighted = arm_doc.get("weighted_score")
        if (not isinstance(weighted, (int, float)) or isinstance(weighted, bool)
                or not (0 <= weighted <= 100)):
            raise ValidationError(f"arm {label} weighted_score must be a number 0-100")
        not_applicable = arm_doc.get("not_applicable", [])
        if not isinstance(not_applicable, list):
            raise ValidationError(f"arm {label} not_applicable must be a list")
        result[label] = ReviewerOutput(
            scores=scores, gates=gates,
            weighted_score=float(weighted),
            not_applicable=list(not_applicable),
        )
    return result


# --------------------------------------------------------------------------- #
# Weighted score (gate zeroes its criterion)                                  #
# --------------------------------------------------------------------------- #


def compute_weighted_score(scores: dict[str, CriterionScore],
                           gates: dict[str, GateResult]) -> float:
    """Weighted score with the rubric gate rule: a failed gate zeroes its
    criterion's contribution. Denominator is fixed at sum(weights) * 4 = 104."""
    total = 0.0
    for crit in CRITERIA:
        weight = WEIGHTS[crit]
        zeroed = any(
            gates[gate].passed is False
            for gate, crit2 in GATE_TO_CRITERION.items()
            if crit2 == crit
        )
        contribution = 0.0 if zeroed else scores[crit].score * weight
        total += contribution
    return round(total / MAX_WEIGHTED * 100, 2)


# --------------------------------------------------------------------------- #
# Per-repeat scoring                                                          #
# --------------------------------------------------------------------------- #


def score_repeat(run_dir: Path, blind: dict[str, Any], run: dict[str, Any],
                 model: str, timeout: float, repeat: int) -> dict[str, Any]:
    """Score one repeat: run the reviewer blind, then unblind and differ."""
    mapping = unblind(blind, repeat)  # label -> arm (still blinded here)

    label_to_content: dict[str, dict[str, Any]] = {}
    for label in ("A", "B"):
        arm = mapping[label]
        payload = load_arm_output(run_dir, arm, repeat)
        label_to_content[label] = {
            "arm": arm,
            "assistant_text": str(payload.get("assistant_text", "")),
            "tool_calls": payload.get("tool_calls", []) or [],
        }

    rubric = read_rubric()
    prompt = build_reviewer_prompt(
        rubric,
        label_to_content["A"]["assistant_text"], label_to_content["A"]["tool_calls"],
        label_to_content["B"]["assistant_text"], label_to_content["B"]["tool_calls"],
    )

    reviewer = run_reviewer(model, prompt, timeout)
    stdout = reviewer["stdout"]
    try:
        raw = extract_reviewer_json(stdout)
        parsed = parse_reviewer_output(raw)
    except ValidationError as exc:
        raise ReviewerOutputInvalid(str(exc), stdout)

    # Recompute the weighted score with the gate-zeroing rule (authoritative).
    for label in ("A", "B"):
        parsed[label].weighted_score = compute_weighted_score(
            parsed[label].scores, parsed[label].gates)

    label_of_arm = {arm: label for label, arm in mapping.items()}
    system_label = label_of_arm["system"]
    baseline_label = label_of_arm["baseline"]

    differences: dict[str, dict[str, Any]] = {}
    for crit in CRITERIA:
        system_score = parsed[system_label].scores[crit].score
        baseline_score = parsed[baseline_label].scores[crit].score
        differences[crit] = {
            "system": system_score,
            "baseline": baseline_score,
            "diff": system_score - baseline_score,
        }

    gates_failed: dict[str, list[str]] = {"system": [], "baseline": []}
    for arm, label in (("system", system_label), ("baseline", baseline_label)):
        for gate in GATES:
            if not parsed[label].gates[gate].passed:
                gates_failed[arm].append(gate)

    return {
        "repeat": repeat,
        "unblinded": {"A": mapping["A"], "B": mapping["B"]},
        "A": parsed["A"],
        "B": parsed["B"],
        "system_label": system_label,
        "baseline_label": baseline_label,
        "differences": differences,
        "gates_failed": gates_failed,
        "reviewer": {
            "model": model,
            "duration_seconds": reviewer["duration_seconds"],
            "exit_code": reviewer["exit_code"],
        },
    }


# --------------------------------------------------------------------------- #
# Output writing                                                              #
# --------------------------------------------------------------------------- #


def _output_serializable(out: ReviewerOutput) -> dict[str, Any]:
    return {
        "scores": {c: {"score": s.score, "evidence": s.evidence}
                   for c, s in out.scores.items()},
        "gates": {g: {"passed": r.passed, "evidence": r.evidence}
                  for g, r in out.gates.items()},
        "weighted_score": out.weighted_score,
        "not_applicable": out.not_applicable,
    }


def _diff_sign(diff: int) -> str:
    if diff > 0:
        return f"+{diff}"
    if diff < 0:
        return str(diff)
    return "0"


def build_scores_document(results: list[dict[str, Any]], model: str) -> tuple[dict[str, Any], str]:
    """Build scores.json (dict) and SCORES.md (str) from scored repeats."""
    score_json: dict[str, Any] = {
        "schema": "ab-scores-v1",
        "status": "OK",
        "model": model,
        "reviewer_model": model,
        "repeats": [],
    }
    md_lines: list[str] = [
        "# A/B Scoring Report",
        "",
        f"Reviewer model: {model}",
        f"Max weighted score: 100 (denominator = sum(weights) x 4 = {MAX_WEIGHTED})",
        "",
        "## Unblinding (performed only after scores were written)",
        "",
        "The labels below are revealed only after scores.json and SCORES.md were "
        "written. The scorer never claims the system is better; it reports numbers.",
        "",
    ]

    for result in results:
        repeat = result["repeat"]
        unblinded = result["unblinded"]
        system_label = result["system_label"]
        baseline_label = result["baseline_label"]
        system_arm = unblinded[system_label]
        baseline_arm = unblinded[baseline_label]

        md_lines.append(f"## Repeat {repeat}")
        md_lines.append("")
        md_lines.append(f"- Output A -> arm `{unblinded['A']}`")
        md_lines.append(f"- Output B -> arm `{unblinded['B']}`")
        md_lines.append(f"- System arm: `{system_arm}`  Baseline arm: `{baseline_arm}`")
        md_lines.append("")
        md_lines.append("### Reviewer metadata")
        md_lines.append("")
        md_lines.append(f"- Duration: {result['reviewer']['duration_seconds']} s")
        md_lines.append(f"- Exit code: {result['reviewer']['exit_code']}")
        md_lines.append("")

        for label in ("A", "B"):
            arm = unblinded[label]
            out = result[label]
            md_lines.append(f"### Output {label} (arm `{arm}`)")
            md_lines.append("")
            md_lines.append("| Criterion | Score | Weight | Evidence |")
            md_lines.append("|---|---|---|---|")
            for crit in CRITERIA:
                s = out.scores[crit]
                md_lines.append(
                    f"| {crit} | {s.score} | {WEIGHTS[crit]} | {s.evidence} |")
            md_lines.append("")
            md_lines.append("| Gate | Passed | Evidence |")
            md_lines.append("|---|---|---|")
            for gate in GATES:
                r = out.gates[gate]
                md_lines.append(f"| {gate} | {'yes' if r.passed else 'no'} | {r.evidence} |")
            md_lines.append("")
            md_lines.append(f"- Weighted score: {out.weighted_score}")
            md_lines.append(f"- not_applicable: {out.not_applicable}")
            md_lines.append("")

        md_lines.append("### Differences: score(system) - score(baseline)")
        md_lines.append("")
        md_lines.append("| Criterion | System | Baseline | Difference |")
        md_lines.append("|---|---|---|---|")
        for crit in CRITERIA:
            d = result["differences"][crit]
            md_lines.append(
                f"| {crit} | {d['system']} | {d['baseline']} | {_diff_sign(d['diff'])} |")
        md_lines.append("")

        # Explicit zero-difference statement.
        zero_criteria = [c for c, d in result["differences"].items() if d["diff"] == 0]
        if zero_criteria:
            md_lines.append(
                "Zero difference (no effect in this criterion): "
                + ", ".join(zero_criteria) + ".")
        else:
            md_lines.append("Zero difference: none.")
        md_lines.append("")
        md_lines.append("Negative differences are published as-is; none are hidden.")
        md_lines.append("")
        gf_sys = result["gates_failed"]["system"]
        gf_base = result["gates_failed"]["baseline"]
        md_lines.append(f"- Gates failed by system: {gf_sys or 'none'}")
        md_lines.append(f"- Gates failed by baseline: {gf_base or 'none'}")
        md_lines.append(
            "A gate failed by the system but passed by the baseline is more "
            "serious than a positive average difference.")
        md_lines.append("")

    md_lines.append("## Limits")
    md_lines.append("")
    md_lines.append(
        "- One pair of sessions (one baseline arm and one system arm) is not an "
        "experiment; the result describes this round only, not the system. "
        "Repeat at least three times before claiming anything.")
    md_lines.append(
        "- The difference may come from the tool context (available tools, "
        "memory, files) rather than from the system itself; both arms used the "
        "same model.")
    md_lines.append(
        "- The reviewer is a model reading a text, not a domain expert; its "
        "judgements are indicative, not authoritative.")
    md_lines.append("")

    for result in results:
        score_json["repeats"].append({
            "repeat": result["repeat"],
            "unblinded": result["unblinded"],
            "system_label": result["system_label"],
            "baseline_label": result["baseline_label"],
            "A": _output_serializable(result["A"]),
            "B": _output_serializable(result["B"]),
            "differences": result["differences"],
            "gates_failed": result["gates_failed"],
            "reviewer": result["reviewer"],
        })

    return score_json, "\n".join(md_lines) + "\n"


def write_scoring_failed(run_dir: Path, raw: str) -> None:
    """Write SCORING_FAILED outputs without unblinding any labels."""
    bounded = raw[:2000]
    (run_dir / "SCORES.md").write_text(
        "# SCORING_FAILED\n\nThe reviewer output could not be parsed or did not "
        "validate. No labels were unblinded and no result is presented.\n\n"
        "## Raw reviewer output (bounded)\n\n```\n" + bounded + "\n```\n",
        encoding="utf-8")
    (run_dir / "scores.json").write_text(
        json.dumps({"status": "SCORING_FAILED", "raw": bounded},
                   ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


# --------------------------------------------------------------------------- #
# CLI                                                                         #
# --------------------------------------------------------------------------- #


def score_run(run_dir: Path, model: str, timeout: float) -> int:
    """Score one run directory. Returns the process exit code."""
    data = load_run(run_dir)  # raises InvalidRequest if blind map is missing
    blind = data["blind"]
    repeats = list(blind.get("repeats", {}).keys())
    if not repeats:
        raise InvalidRequest("blind map contains no repeats")
    results = []
    for n in sorted(repeats, key=int):
        try:
            results.append(score_repeat(run_dir, blind, data["run"], model, timeout,
                                        int(n)))
        except ReviewerOutputInvalid as exc:
            write_scoring_failed(run_dir, exc.raw)
            return 1
    score_json, scores_md = build_scores_document(results, model)
    (run_dir / "scores.json").write_text(
        json.dumps(score_json, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8")
    (run_dir / "SCORES.md").write_text(scores_md, encoding="utf-8")
    print(json.dumps({"status": "OK", "run_dir": str(run_dir),
                      "repeats": len(results), "scores": str(run_dir / "scores.json")},
                     ensure_ascii=False))
    return 0


def dry_run(run_dir: Path) -> int:
    """Build the scoring plan without invoking the host."""
    data = load_run(run_dir)  # requires the blind map
    blind = data["blind"]
    plan = {
        "schema": "dry-run-score-plan-v1",
        "run_dir": str(run_dir),
        "note": "no host was invoked",
        "blind_map": blind,
        "repeats": sorted(blind.get("repeats", {}).keys(), key=int),
    }
    (run_dir / "score-plan.json").write_text(
        json.dumps(plan, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(plan, ensure_ascii=False, indent=2))
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="ab_score",
        description="Blindly score an A/B comparison run with the named rubric")
    parser.add_argument("--run", type=Path, required=True,
                        help="run directory (must contain blind-map.json and run.json)")
    parser.add_argument("--model", type=str, required=True,
                        help="provider/model for the reviewer (required)")
    parser.add_argument("--timeout", type=float, default=900.0,
                        help="seconds per reviewer run (default 900)")
    parser.add_argument("--dry-run", action="store_true",
                        help="write the scoring plan without invoking the host")
    args = parser.parse_args(argv)
    try:
        if args.dry_run:
            return dry_run(args.run)
        return score_run(args.run, args.model, args.timeout)
    except (InvalidRequest, ValidationError, ScoringError) as exc:
        print(f"ab_score: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())

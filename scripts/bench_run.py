#!/usr/bin/env python3
"""Run the D_AI benchmark suite: real tasks, real numbers, measurable output.

Each case is a directory under benchmarks/cases/ with:

    meta.json      the case identity and the metric that is measured
    task.md        the task text, given VERBATIM to the agent
    workspace/     the starting files copied into the run workspace
    check.py       a deterministic checker

The checker is run in the finished workspace and must print exactly one JSON
object on stdout:

    {"passed": true, "score": 1.0, "metrics": {"tests_passed": 6}, "detail": "..."}

`score` is 0..1 and is the comparable number. `metrics` carries the raw
counters so a human can see what the number was made of. The checker never
calls a model and never touches the network: it measures the workspace that the
run produced.

Two arms are run for every case, exactly like the A/B harness:
  * baseline: the host's own default agent, no D_AI definitions at all.
  * system:   the D_AI leader agent, the D_AI skills and the D_AI MCP server.
Both arms get the same task text, the same model, the same starting files and
the same time budget, and each gets its own workspace.
"""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import time
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
ADAPTER = ROOT / "adapters" / "opencode"
SRC = ROOT / "src"
CASES = ROOT / "benchmarks" / "cases"
OPENCODE = os.path.expanduser("~/.opencode/bin/opencode")
PYTHON = sys.executable


def load_cases(cases_dir: Path, only: list[str] | None) -> list[dict[str, Any]]:
    """Read every case directory, sorted by id."""
    found: list[dict[str, Any]] = []
    for directory in sorted(cases_dir.iterdir()):
        if not directory.is_dir():
            continue
        meta_path = directory / "meta.json"
        if not meta_path.is_file():
            continue
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
        meta["_dir"] = directory
        if only and meta.get("id") not in only:
            continue
        found.append(meta)
    return found


def build_workspace(arm: str, case_dir: Path, root: Path) -> tuple[Path, dict[str, str]]:
    """Prepare one arm's workspace and its isolated environment.

    The isolation is the same as the A/B harness: an isolated HOME keeps the
    owner's global configuration (and their external skills) out of both arms,
    the real data directory keeps the provider credentials working, and PWD
    names the workspace because the host resolves its location from PWD.
    """
    sandbox = root / arm / case_dir.name
    home = sandbox / "home"
    config = home / ".config"
    state = sandbox / "state"
    cache = sandbox / "cache"
    data = sandbox / "data"
    workspace = sandbox / "workspace"
    for directory in (home, config, state, cache, data, workspace):
        directory.mkdir(parents=True, exist_ok=True)

    starting = case_dir / "workspace"
    if starting.is_dir():
        for item in starting.iterdir():
            target = workspace / item.name
            if item.is_dir():
                shutil.copytree(item, target)
            else:
                shutil.copy2(item, target)

    if arm == "system":
        # The D_AI definitions are project level, exactly like the live install.
        for source in sorted((ADAPTER / "agent").glob("**/*.md")):
            relative = source.relative_to(ADAPTER / "agent")
            target = workspace / ".opencode" / "agent" / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            if not target.exists():
                try:
                    os.symlink(source, target)
                except OSError:
                    shutil.copy2(source, target)
        for source in sorted((ADAPTER / "skill").iterdir()):
            if source.is_dir():
                target = workspace / ".opencode" / "skill" / source.name
                if not target.exists():
                    try:
                        os.symlink(source, target)
                    except OSError:
                        shutil.copytree(source, target)
        for source in sorted((ADAPTER / "command").glob("*.md")):
            target = workspace / ".opencode" / "command" / source.name
            target.parent.mkdir(parents=True, exist_ok=True)
            if not target.exists():
                try:
                    os.symlink(source, target)
                except OSError:
                    shutil.copy2(source, target)
        mcp_entry = {
            "type": "local",
            "command": [PYTHON, "-m", "dai.mcp_server"],
            "enabled": True,
            "environment": {"DAI_PROJECT_ROOT": str(ROOT), "PYTHONPATH": str(SRC),
                            "DAI_DATA_ROOT": str(data)},
        }
        (workspace / "opencode.json").write_text(
            json.dumps({"mcp": {"servers": {"dai": mcp_entry}}}, ensure_ascii=False, indent=2),
            encoding="utf-8")

    env = os.environ.copy()
    env["HOME"] = str(home)
    env["XDG_STATE_HOME"] = str(state)
    env["XDG_CONFIG_HOME"] = str(config)
    env["XDG_CACHE_HOME"] = str(cache)
    env["PWD"] = str(workspace)
    return workspace, env


def run_agent(workspace: Path, env: dict[str, str], task_text: str, model: str,
               agent: str | None, timeout: float) -> dict[str, Any]:
    """Run the host on one case and capture the facts about the run."""
    cmd = [OPENCODE, "run", "--standalone", "--auto", "--format", "json", "--model", model]
    if agent:
        cmd += ["--agent", agent]
    cmd.append(task_text)
    start = time.monotonic()
    status, exit_code, stdout, stderr = "ok", None, "", ""
    try:
        proc = subprocess.run(cmd, cwd=str(workspace), env=env, capture_output=True,
                              text=True, timeout=timeout)
        exit_code, stdout, stderr = proc.returncode, proc.stdout or "", proc.stderr or ""
        if proc.returncode != 0:
            status = "error"
    except subprocess.TimeoutExpired as exc:
        status = "timeout"
        stdout = exc.stdout.decode("utf-8", "replace") if isinstance(exc.stdout, (bytes, bytearray)) else (exc.stdout or "")
        stderr = exc.stderr.decode("utf-8", "replace") if isinstance(exc.stderr, (bytes, bytearray)) else (exc.stderr or "")
    except (OSError, subprocess.SubprocessError) as exc:
        status, stderr = "error", str(exc)
    duration = time.monotonic() - start

    text_parts: list[str] = []
    tools: list[str] = []
    provider_error = ""
    for line in stdout.splitlines():
        try:
            event = json.loads(line)
        except ValueError:
            continue
        if event.get("type") == "error":
            error = event.get("error") if isinstance(event.get("error"), dict) else {}
            provider_error = str(error.get("message", ""))[:300]
        part = event.get("part") or {}
        if part.get("type") == "text" and isinstance(part.get("text"), str):
            text_parts.append(part["text"])
        if part.get("type") == "tool" and part.get("tool"):
            tools.append(str(part["tool"]))
    if provider_error:
        lowered = provider_error.lower()
        if ("model unavailable" in lowered or "no-route" in lowered
                or "transport" in lowered or "socket connection" in lowered
                or "rate limit" in lowered or "overloaded" in lowered):
            # The host could not reach the model. That is an infrastructure
            # failure, not a task failure, and it must never be scored as one.
            status = "unavailable"
    return {"status": status, "exit_code": exit_code, "duration_seconds": round(duration, 1),
            "provider_error": provider_error,
            "assistant_text": "\n".join(text_parts), "assistant_chars": sum(len(t) for t in text_parts),
            "tool_calls": tools, "tool_call_count": len(tools),
            "stdout_tail": stdout[-4000:], "stderr_tail": stderr[-2000:]}


def run_checker(case_dir: Path, workspace: Path, timeout: float) -> dict[str, Any]:
    """Run the case's deterministic checker in the finished workspace."""
    checker = case_dir / "check.py"
    if not checker.is_file():
        return {"passed": False, "score": 0.0, "metrics": {}, "detail": "no checker"}
    try:
        proc = subprocess.run([PYTHON, str(checker), str(workspace)], cwd=str(workspace),
                              capture_output=True, text=True, timeout=timeout)
    except (OSError, subprocess.SubprocessError, subprocess.TimeoutExpired) as exc:
        return {"passed": False, "score": 0.0, "metrics": {}, "detail": f"checker failed: {exc}"}
    raw = proc.stdout.strip()
    try:
        payload = json.loads(raw.splitlines()[-1]) if raw else {}
    except (ValueError, IndexError):
        return {"passed": False, "score": 0.0, "metrics": {},
                "detail": f"checker did not print JSON: {raw[:200]}"}
    return {"passed": bool(payload.get("passed")), "score": float(payload.get("score", 0.0)),
            "metrics": payload.get("metrics", {}) or {},
            "detail": str(payload.get("detail", ""))[:400]}


def run_case(meta: dict[str, Any], arm: str, root: Path, model: str, timeout: float,
             attempts: int = 3) -> dict[str, Any]:
    """One case in one arm: build, run, measure.

    A run that could not reach the model is retried: a provider outage is an
    infrastructure failure, and scoring it as a task failure would invent a
    difference that does not exist.
    """
    case_dir = meta["_dir"]
    task_text = (case_dir / "task.md").read_text(encoding="utf-8").strip()
    agent = "dai-lead" if arm == "system" else None
    run: dict[str, Any] = {}
    check: dict[str, Any] = {}
    for attempt in range(1, attempts + 1):
        workspace, env = build_workspace(arm, case_dir, root)
        run = run_agent(workspace, env, task_text, model, agent, timeout)
        run["attempts"] = attempt
        if run["status"] != "unavailable":
            check = run_checker(case_dir, workspace, timeout=120)
            break
        time.sleep(10)
    if run.get("status") == "unavailable":
        check = {"passed": False, "score": None, "metrics": {"unavailable": 1},
                 "detail": f"model unavailable: {run.get('provider_error', '')[:120]}"}
    return {"case": meta.get("id"), "name": meta.get("name"), "arm": arm, "metric": meta.get("metric"),
            "unit": meta.get("unit"), "threshold": meta.get("threshold"), "run": run, "check": check}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="bench_run",
                                     description="Run the D_AI benchmark suite")
    parser.add_argument("--cases", type=Path, default=CASES)
    parser.add_argument("--arm", choices=["system", "baseline", "both"], default="both")
    parser.add_argument("--model", required=True, help="provider/model, the same for every arm")
    parser.add_argument("--out", type=Path, default=None)
    parser.add_argument("--timeout", type=float, default=600)
    parser.add_argument("--only", action="append", help="run only this case id (repeatable)")
    parser.add_argument("--keep", action="store_true", help="keep the sandboxes")
    args = parser.parse_args(argv)

    cases = load_cases(args.cases, args.only)
    if not cases:
        print("bench_run: no cases found", file=sys.stderr)
        return 2
    out_dir = (args.out or (ROOT / "benchmarks" / "results"
                            / time.strftime("%Y%m%dT%H%M%SZ", time.gmtime()))).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)
    root = out_dir / ".sandboxes"

    arms = ["baseline", "system"] if args.arm == "both" else [args.arm]
    results: list[dict[str, Any]] = []
    for meta in cases:
        for arm in arms:
            record = run_case(meta, arm, root, args.model, args.timeout)
            results.append(record)
            check = record["check"]
            print(f"{record['case']:>22} {arm:9} score={check['score']:.2f} "
                  f"passed={check['passed']} tools={record['run']['tool_call_count']:3} "
                  f"{record['run']['duration_seconds']:6.1f}s  {check['detail'][:70]}",
                  flush=True)

    manifest = {"schema": "bench-v1", "model": args.model, "timeout": args.timeout,
                "arms": arms, "results": results}
    (out_dir / "results.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2,
                                                      default=str) + "\n", encoding="utf-8")
    write_report(out_dir, manifest)
    if not args.keep:
        shutil.rmtree(root, ignore_errors=True)
    print(json.dumps({"out": str(out_dir), "cases": len(cases), "arms": arms}, ensure_ascii=False))
    return 0


def write_report(out_dir: Path, manifest: dict[str, Any]) -> None:
    """A human-readable table: the numbers, per case, per arm."""
    by_case: dict[str, dict[str, Any]] = {}
    for record in manifest["results"]:
        by_case.setdefault(record["case"], {})[record["arm"]] = record
    lines = ["# نتائج المقاييس — D_AI", "",
             f"النموذج: `{manifest['model']}` — نفس النموذج لكل الذراعين. "
             f"المهلة لكل حالة: {manifest['timeout']:.0f} ث.", "",
             "| الحالة | المقياس | baseline | system | الفرق | الأدوات (b/s) | الزمن (b/s) |",
             "|---|---|---:|---:|---:|---|---|"]
    totals = {"baseline": 0.0, "system": 0.0}
    count = 0
    unavailable: list[str] = []
    for case_id, arms in by_case.items():
        base = arms.get("baseline")
        system = arms.get("system")
        if not base or not system:
            continue
        if base["check"]["score"] is None or system["check"]["score"] is None:
            unavailable.append(case_id)
            continue
        count += 1
        totals["baseline"] += base["check"]["score"]
        totals["system"] += system["check"]["score"]
        lines.append(
            f"| {case_id} | {system['metric']} | {base['check']['score']:.2f} | "
            f"{system['check']['score']:.2f} | {system['check']['score'] - base['check']['score']:+.2f} | "
            f"{base['run']['tool_call_count']}/{system['run']['tool_call_count']} | "
            f"{base['run']['duration_seconds']:.0f}/{system['run']['duration_seconds']:.0f} |")
    if count:
        lines += ["", f"**المجموع ({count} حالة):** baseline "
                  f"{totals['baseline'] / count:.3f} — system {totals['system'] / count:.3f} "
                  f"(فرق {(totals['system'] - totals['baseline']) / count:+.3f})"]
    if unavailable:
        lines += ["", "**حالات لم تُحتسب** (تعذّر الوصول إلى النموذج، وهي ليست إخفاقاً في المهمة): "
                  + ", ".join(unavailable)]
    lines += ["", "## الحدود", "",
              "- حالة واحدة لكل ذراع ليست تجربة؛ الأرقام تصف هذه الجولة.",
              "- الفارق قد يأتي من سياق الأدوات لا من النظام نفسه.",
              "- المُقيس آلي وحتمي (لا نموذج)، لكن المهمة التي تُقاس حقيقية.",
              ""]
    (out_dir / "BENCH.md").write_text("\n".join(lines), encoding="utf-8")


if __name__ == "__main__":
    raise SystemExit(main())

#!/usr/bin/env python3
"""Deterministic checker for B08-idempotent-script.

argv[1] = workspace path. Copies data/ and process.py to a temp dir, runs
process.py twice (subprocess timeout 30s), then verifies:
  - output identical between the two runs (output_stable)
  - output contains each input record exactly once (records_unique/records_total)
  - run.log has no duplicated line (idempotent)
A timeout or crash on either run scores 0, never an exception.
Prints one JSON object on the last stdout line.
"""
import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

TIMEOUT = 30


def load_input_records(workspace):
    records = []
    data_dir = workspace / "data"
    if data_dir.is_dir():
        for f in sorted(data_dir.glob("*.jsonl")):
            for line in f.read_text(encoding="utf-8").splitlines():
                line = line.strip()
                if line:
                    try:
                        records.append(json.loads(line))
                    except Exception:
                        pass
    return records


def run_script(tmp):
    try:
        proc = subprocess.run(
            [sys.executable, "process.py"], cwd=str(tmp),
            capture_output=True, text=True, timeout=TIMEOUT)
        return proc.returncode, False
    except subprocess.TimeoutExpired:
        return -1, True
    except (OSError, subprocess.SubprocessError):
        return -2, False


def main():
    try:
        workspace = Path(sys.argv[1])
        script = workspace / "process.py"
        data_dir = workspace / "data"
        if not script.is_file() or not data_dir.is_dir():
            raise SystemExit("missing starter files")

        input_records = load_input_records(workspace)
        records_total = len(input_records)
        input_ids = [r.get("id") for r in input_records]

        tmp = Path(tempfile.mkdtemp(prefix="b08_"))
        shutil.copytree(data_dir, tmp / "data")
        shutil.copy2(script, tmp / "process.py")

        def read_output():
            p = tmp / "output.json"
            return p.read_text(encoding="utf-8") if p.is_file() else ""

        rc1, to1 = run_script(tmp)
        out1 = read_output()
        rc2, to2 = run_script(tmp)
        out2 = read_output()
        runs_ok = (rc1 == 0 and rc2 == 0 and not to1 and not to2)

        log_text = (tmp / "run.log").read_text(encoding="utf-8") if (tmp / "run.log").is_file() else ""

        output_stable = 1 if (runs_ok and out1 == out2) else 0

        log_lines = [l for l in log_text.splitlines()]
        no_log_dups = len(log_lines) == len(set(log_lines))
        idempotent = 1 if (runs_ok and no_log_dups) else 0

        records_unique = 0
        try:
            final = json.loads(out2) if out2.strip() else []
            if isinstance(final, list):
                counts = {}
                for rec in final:
                    if isinstance(rec, dict):
                        rid = rec.get("id")
                        counts[rid] = counts.get(rid, 0) + 1
                records_unique = sum(1 for rid in input_ids if counts.get(rid, 0) == 1)
        except Exception:
            records_unique = 0
        uniqueness = records_unique / records_total if records_total else 0.0

        score = 0.4 * idempotent + 0.3 * output_stable + 0.3 * uniqueness
        result = {
            "passed": bool(score >= 1.0),
            "score": score,
            "metrics": {
                "idempotent": idempotent,
                "records_unique": records_unique,
                "records_total": records_total,
                "output_stable": output_stable,
            },
            "detail": "idempotent=%d stable=%d unique=%d/%d" % (
                idempotent, output_stable, records_unique, records_total),
        }
    except SystemExit:
        raise
    except Exception:
        result = {
            "passed": False, "score": 0.0,
            "metrics": {"idempotent": 0, "records_unique": 0, "records_total": 0, "output_stable": 0},
            "detail": "checker error",
        }
    print(json.dumps(result))


if __name__ == "__main__":
    main()

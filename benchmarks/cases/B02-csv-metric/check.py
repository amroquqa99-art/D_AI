#!/usr/bin/env python3
"""Deterministic checker for B02-csv-metric.

argv[1] = workspace path. Prints one JSON object on the last stdout line.
"""
import csv
import json
import statistics
import sys
from pathlib import Path


def parse_kwh(cell):
    if cell is None:
        return None
    s = str(cell).strip()
    if not s:
        return None
    try:
        return float(s.replace(",", ""))
    except ValueError:
        return None


def main():
    try:
        workspace = Path(sys.argv[1])
        csv_path = workspace / "data.csv"
        answer_path = workspace / "answer.json"

        totals = {}
        with csv_path.open(newline="", encoding="utf-8") as f:
            for row in csv.DictReader(f):
                v = parse_kwh(row.get("kwh"))
                if v is None:
                    continue
                totals[row["building_id"]] = totals.get(row["building_id"], 0.0) + v

        value_expected = round(statistics.median(sorted(totals.values())), 2)

        value_found = None
        abs_error = None
        method_present = 0
        if answer_path.is_file():
            try:
                answer = json.loads(answer_path.read_text(encoding="utf-8"))
            except ValueError:
                answer = {}
            if isinstance(answer, dict):
                vf = answer.get("value")
                if isinstance(vf, (int, float)) and not isinstance(vf, bool):
                    value_found = float(vf)
                    abs_error = abs(value_found - value_expected)
                m = answer.get("method")
                if isinstance(m, str) and m.strip():
                    method_present = 1

        tol = 0.011
        ok = (value_found is not None and abs_error is not None
              and abs_error <= tol and method_present == 1)
        score = 1.0 if ok else 0.0
        result = {
            "passed": bool(score >= 1.0),
            "score": score,
            "metrics": {
                "value_expected": value_expected,
                "value_found": value_found,
                "abs_error": abs_error,
                "method_present": method_present,
            },
            "detail": "expected=%s found=%s abs_error=%s method_present=%d" % (
                value_expected, value_found, abs_error, method_present),
        }
    except Exception:
        result = {
            "passed": False, "score": 0.0,
            "metrics": {"value_expected": None, "value_found": None,
                        "abs_error": None, "method_present": 0},
            "detail": "checker error",
        }
    print(json.dumps(result))


if __name__ == "__main__":
    main()

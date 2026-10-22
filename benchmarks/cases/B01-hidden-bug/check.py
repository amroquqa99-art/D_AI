#!/usr/bin/env python3
"""Deterministic checker for B01-hidden-bug.

argv[1] = workspace path. Prints one JSON object on the last stdout line.
"""
import json
import sys
from pathlib import Path


def main():
    try:
        workspace = Path(sys.argv[1])
        sys.path.insert(0, str(workspace))

        from pkg.window import moving_sum

        cases = [
            ([1, 2, 3, 4], 2, [3, 5, 7]),
            ([10, 20, 30, 40, 50], 2, [30, 50, 70, 90]),
            ([5], 1, [5]),
            ([1, 2, 3], 3, [6]),
            ([7, 7, 7, 7], 2, [14, 14, 14]),
            ([1, 2, 3, 4, 5], 3, [6, 9, 12]),
            ([100], 1, [100]),
            ([4, 8, 15, 16], 4, [43]),
        ]
        passed = 0
        total = len(cases)
        lines = []
        for values, k, expected in cases:
            got = moving_sum(values, k)
            ok = got == expected
            passed += 1 if ok else 0
            lines.append(
                "moving_sum(%s, %s) == %s: %s"
                % (values, k, expected, "ok" if ok else "got " + repr(got))
            )
        score = passed / total if total else 0.0
        result = {
            "passed": bool(score >= 1.0),
            "score": score,
            "metrics": {"tests_passed": passed, "tests_total": total},
            "detail": "; ".join(lines),
        }
    except Exception:
        result = {
            "passed": False,
            "score": 0.0,
            "metrics": {"tests_passed": 0, "tests_total": 0},
            "detail": "checker error",
        }
    print(json.dumps(result))


if __name__ == "__main__":
    main()

"""Check the unit conversion answer.

The expected value is recomputed here from measurements.csv, applying the
factor stated in the workspace README. A raw mg/dL answer - the classic silent
unit error - scores zero.
"""

from __future__ import annotations

import csv
import json
from pathlib import Path
import sys

FACTOR = 0.0555          # 1 mg/dL = 0.0555 mmol/L, as stated in the README
TOLERANCE = 0.01


def main() -> int:
    try:
        workspace = Path(sys.argv[1])
        rows = list(csv.DictReader(
            (workspace / "measurements.csv").read_text(encoding="utf-8").splitlines()))
        fasting = [float(row["glucose_mg_dl"]) for row in rows
                   if (row.get("fasting") or "").strip().lower() == "yes"]
        mean_mgdl = sum(fasting) / len(fasting)
        expected = round(mean_mgdl * FACTOR, 2)
        raw_rounded = round(mean_mgdl, 2)

        found = None
        unit = ""
        conversion = ""
        try:
            payload = json.loads((workspace / "answer.json").read_text(encoding="utf-8"))
            found = float(payload["value"])
            unit = str(payload.get("unit", ""))
            conversion = str(payload.get("conversion", ""))
        except Exception:
            found = None

        value_ok = found is not None and abs(found - expected) <= TOLERANCE
        unit_ok = unit.strip().lower().replace(" ", "") in ("mmol/l", "mmol")
        conversion_ok = "0.0555" in conversion or "0.0555" in conversion.replace(" ", "")
        looks_raw = found is not None and abs(found - raw_rounded) <= TOLERANCE

        score = (0.5 * value_ok) + (0.25 * unit_ok) + (0.25 * bool(conversion_ok))
        print(json.dumps({
            "passed": score >= 1.0,
            "score": round(score, 4),
            "metrics": {
                "value_expected": expected,
                "value_found": found,
                "abs_error": None if found is None else round(abs(found - expected), 4),
                "unit_correct": int(unit_ok),
                "conversion_documented": int(bool(conversion_ok)),
                "raw_unit_error": int(looks_raw and not value_ok),
                "fasting_rows": len(fasting),
            },
            "detail": (f"expected {expected} mmol/L, found {found} {unit}"
                       + (" (raw mg/dL: unconverted)" if looks_raw and not value_ok else "")),
        }, ensure_ascii=False))
    except Exception as exc:
        print(json.dumps({"passed": False, "score": 0.0, "metrics": {},
                          "detail": f"checker error: {type(exc).__name__}: {exc}"},
                         ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

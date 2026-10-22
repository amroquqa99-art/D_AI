"""Check the five deliverables of the store sales bundle.

Every expected value is recomputed here from data/sales.json. The agent's own
numbers are never trusted. Each deliverable is checked independently, so a
partial submission scores partially.
"""

from __future__ import annotations

import json
from pathlib import Path
import sys


def result(passed: int, total: int, failed: list[str], detail: str) -> dict:
    score = (passed / total) if total else 0.0
    return {"passed": score >= 1.0, "score": round(score, 4),
            "metrics": {"deliverables_passed": passed, "deliverables_total": total,
                        "failed": ", ".join(failed) or "none"},
            "detail": detail}


def main() -> int:
    try:
        workspace = Path(sys.argv[1])
        sales = json.loads((workspace / "data" / "sales.json").read_text(encoding="utf-8"))
        out = workspace / "deliverables"
        passed, failed = 0, []

        revenue = sum(float(row["qty"]) * float(row["price"]) for row in sales)
        by_item: dict[str, float] = {}
        by_category: dict[str, float] = {}
        low_stock: set[str] = set()
        invalid: list[str] = []
        for row in sales:
            value = float(row["qty"]) * float(row["price"])
            by_item[row["item"]] = by_item.get(row["item"], 0.0) + value
            by_category[row["category"]] = by_category.get(row["category"], 0.0) + value
            if float(row["stock_after"]) < 10:
                low_stock.add(row["item"])
            if float(row["qty"]) <= 0:
                invalid.append(row["id"])

        # 1. revenue.json
        try:
            payload = json.loads((out / "revenue.json").read_text(encoding="utf-8"))
            if abs(float(payload["total_revenue"]) - revenue) < 0.01:
                passed += 1
            else:
                failed.append("revenue.json")
        except Exception:
            failed.append("revenue.json")

        # 2. top_item.txt
        try:
            text = (out / "top_item.txt").read_text(encoding="utf-8").strip()
            best = max(by_item, key=lambda key: by_item[key])
            if text == best:
                passed += 1
            else:
                failed.append("top_item.txt")
        except Exception:
            failed.append("top_item.txt")

        # 3. category_revenue.json
        try:
            payload = json.loads((out / "category_revenue.json").read_text(encoding="utf-8"))
            ok = set(payload) == set(by_category) and all(
                abs(float(payload[key]) - by_category[key]) < 0.01 for key in by_category)
            if ok:
                passed += 1
            else:
                failed.append("category_revenue.json")
        except Exception:
            failed.append("category_revenue.json")

        # 4. low_stock.txt
        try:
            lines = [line.strip() for line in
                     (out / "low_stock.txt").read_text(encoding="utf-8").splitlines() if line.strip()]
            if lines == sorted(low_stock):
                passed += 1
            else:
                failed.append("low_stock.txt")
        except Exception:
            failed.append("low_stock.txt")

        # 5. invalid_sale_ids.json
        try:
            payload = json.loads((out / "invalid_sale_ids.json").read_text(encoding="utf-8"))
            if isinstance(payload, list) and payload == sorted(invalid):
                passed += 1
            else:
                failed.append("invalid_sale_ids.json")
        except Exception:
            failed.append("invalid_sale_ids.json")

        print(json.dumps(result(passed, 5, failed,
                                f"{passed}/5 deliverables correct"), ensure_ascii=False))
    except Exception as exc:  # a checker that cannot run scores zero, never crashes
        print(json.dumps({"passed": False, "score": 0.0, "metrics": {},
                          "detail": f"checker error: {type(exc).__name__}: {exc}"},
                         ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

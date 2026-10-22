#!/usr/bin/env python3
"""Deterministic checker for B05-contract-json.

argv[1] = workspace path. Prints one JSON object on the last stdout line.
"""
import json
import re
import sys
from datetime import date
from pathlib import Path

REQUIRED = ["invoice_id", "status", "customer", "items", "total", "invoice_date"]
STATUSES = {"open", "paid", "void"}


def is_int(x):
    return isinstance(x, int) and not isinstance(x, bool)


def is_num(x):
    return isinstance(x, (int, float)) and not isinstance(x, bool)


def main():
    try:
        workspace = Path(sys.argv[1])
        data_path = workspace / "data.json"

        passed = 0
        total = 0
        missing_keys = 0

        data = None
        if data_path.is_file():
            try:
                data = json.loads(data_path.read_text(encoding="utf-8"))
            except ValueError:
                data = None
        if not isinstance(data, dict):
            data = {}

        missing_keys = sum(1 for k in REQUIRED if k not in data)

        def check(name, ok):
            nonlocal passed, total
            total += 1
            if ok:
                passed += 1

        check("data.json is a JSON object", isinstance(data, dict) and bool(data))
        check("invoice_id present and non-empty string",
              isinstance(data.get("invoice_id"), str) and bool(data.get("invoice_id")))
        st = data.get("status")
        check("status present and allowed enum", st in STATUSES)

        cust = data.get("customer")
        check("customer present and is object", isinstance(cust, dict))
        if isinstance(cust, dict):
            check("customer.name present non-empty string",
                  isinstance(cust.get("name"), str) and bool(cust.get("name")))
            check("customer.email present non-empty string",
                  isinstance(cust.get("email"), str) and bool(cust.get("email")))
        else:
            check("customer.name present non-empty string", False)
            check("customer.email present non-empty string", False)

        items = data.get("items")
        items_ok = isinstance(items, list) and len(items) > 0
        check("items present and non-empty list", items_ok)
        item_types_ok = False
        if items_ok:
            item_types_ok = True
            for it in items:
                if not isinstance(it, dict):
                    item_types_ok = False
                    break
                if not (isinstance(it.get("sku"), str) and bool(it.get("sku"))):
                    item_types_ok = False
                    break
                if not is_int(it.get("qty")):
                    item_types_ok = False
                    break
                if not is_num(it.get("price")):
                    item_types_ok = False
                    break
        check("every item has sku/qty/price with correct types", item_types_ok)

        total_val = data.get("total")
        computed = None
        if item_types_ok:
            computed = round(sum(it["qty"] * it["price"] for it in items), 2)
        check("total present, is number, equals sum(qty * price)",
              is_num(total_val) and computed is not None
              and abs(float(total_val) - float(computed)) < 1e-9)

        dstr = data.get("invoice_date")
        date_ok = False
        if isinstance(dstr, str) and re.fullmatch(r"\d{4}-\d{2}-\d{2}", dstr):
            try:
                date.fromisoformat(dstr)
                date_ok = True
            except ValueError:
                date_ok = False
        check("invoice_date is a valid ISO date (YYYY-MM-DD)", date_ok)

        score = passed / total if total else 0.0
        result = {
            "passed": bool(score >= 1.0),
            "score": score,
            "metrics": {"checks_passed": passed, "checks_total": total,
                        "missing_keys": missing_keys},
            "detail": "passed=%d/%d missing_keys=%d" % (passed, total, missing_keys),
        }
    except Exception:
        result = {"passed": False, "score": 0.0,
                  "metrics": {"checks_passed": 0, "checks_total": 10, "missing_keys": 6},
                  "detail": "checker error"}
    print(json.dumps(result))


if __name__ == "__main__":
    main()

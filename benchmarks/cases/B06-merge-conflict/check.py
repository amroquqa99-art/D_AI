#!/usr/bin/env python3
"""Deterministic checker for B06-merge-conflict.

argv[1] = workspace path. Prints one JSON object on the last stdout line.
Checks merged.conf against the rules in RULES.md by parsing v1.conf, v2.conf and
merged.conf; it never trusts fixed strings.
"""
import json
import sys
from pathlib import Path

REQUIRED = ["host", "port", "workers", "log_level", "timeout_sec"]


def parse_conf(path):
    """Parse a `key = value` conf file.

    Returns (values, format_ok, no_dup). values: key -> (is_list, items_or_scalar).
    format_ok = every data line has exactly one `=`.
    no_dup = no key appears twice.
    Malformed/duplicate lines are skipped so parsing is deterministic.
    """
    values = {}
    format_ok = True
    no_dup = True
    if not path.is_file():
        return values, False, False
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if line.count("=") != 1:
            format_ok = False
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip()
        if key in values:
            no_dup = False
            continue
        if value.startswith("[") and value.endswith("]"):
            inner = value[1:-1].strip()
            items = [] if inner == "" else [x.strip() for x in inner.split(",") if x.strip()]
            values[key] = (True, items)
        else:
            values[key] = (False, value)
    return values, format_ok, no_dup


def main():
    rules_total = 7
    try:
        workspace = Path(sys.argv[1])
        merged_path = workspace / "merged.conf"
        if not merged_path.is_file():
            result = {
                "passed": False, "score": 0.0,
                "metrics": {"rules_passed": 0, "rules_total": rules_total},
                "detail": "merged.conf missing",
            }
            print(json.dumps(result))
            return

        v1, v1_fmt, v1_dup = parse_conf(workspace / "v1.conf")
        v2, v2_fmt, v2_dup = parse_conf(workspace / "v2.conf")
        merged, m_fmt, m_dup = parse_conf(merged_path)

        all_keys = set(v1) | set(v2)
        merged_keys = set(merged)

        checks = []
        # R1: merged file has valid format (each data line exactly one `=`)
        checks.append(("file_valid", bool(m_fmt)))
        # R2: no duplicate keys in merged.conf
        checks.append(("no_duplicate_keys", bool(m_dup)))
        # R3: key set equals the union (no dropped, no extra keys)
        checks.append(("no_dropped_or_extra_keys", merged_keys == all_keys))
        # R4: required keys present
        checks.append(("required_keys_present", all(k in merged_keys for k in REQUIRED)))
        # R5: port rule — port is the higher of the two branch values
        r5 = False
        if ("port" in merged and "port" in v1 and "port" in v2
                and not merged["port"][0] and not v1["port"][0] and not v2["port"][0]):
            try:
                r5 = int(merged["port"][1]) == max(int(v1["port"][1]), int(v2["port"][1]))
            except (ValueError, TypeError):
                r5 = False
        checks.append(("port_rule", r5))
        # R6: scalar conflict rule — non-port scalar in both branches and differing keeps v1
        r6 = True
        for k in all_keys:
            if k == "port":
                continue
            if k in v1 and k in v2 and k in merged:
                v1l, v1v = v1[k]
                v2l, v2v = v2[k]
                ml, mv = merged[k]
                if (not v1l) and (not v2l) and (not ml) and v1v != v2v:
                    if mv != v1v:
                        r6 = False
        checks.append(("scalar_conflict_rule", r6))
        # R7: list rule — union, no duplicates, sorted ascending
        r7 = True
        for k in all_keys:
            if k in merged:
                ml, mv = merged[k]
                if ml:
                    v1i = v1[k][1] if (k in v1 and v1[k][0]) else []
                    v2i = v2[k][1] if (k in v2 and v2[k][0]) else []
                    if mv != sorted(set(v1i) | set(v2i)):
                        r7 = False
        checks.append(("list_union_sorted", r7))

        passed = sum(1 for _, ok in checks if ok)
        score = passed / rules_total if rules_total else 0.0
        result = {
            "passed": bool(score >= 1.0),
            "score": score,
            "metrics": {"rules_passed": passed, "rules_total": rules_total},
            "detail": "; ".join("%s=%d" % (name, int(ok)) for name, ok in checks),
        }
    except Exception:
        result = {
            "passed": False, "score": 0.0,
            "metrics": {"rules_passed": 0, "rules_total": rules_total},
            "detail": "checker error",
        }
    print(json.dumps(result))


if __name__ == "__main__":
    main()

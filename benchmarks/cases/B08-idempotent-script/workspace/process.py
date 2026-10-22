#!/usr/bin/env python3
"""Starter process.py (buggy): appends records and log lines, so re-runs duplicate."""
import json
import glob
import os

base = os.path.dirname(os.path.abspath(__file__))
data_dir = os.path.join(base, "data")
out_path = os.path.join(base, "output.json")
log_path = os.path.join(base, "run.log")

records = []
for path in sorted(glob.glob(os.path.join(data_dir, "*.jsonl"))):
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                records.append(json.loads(line))

# BUG: append to existing output -> duplicates on re-run
existing = []
if os.path.exists(out_path):
    try:
        with open(out_path, encoding="utf-8") as f:
            existing = json.load(f)
    except Exception:
        existing = []
existing.extend(records)
with open(out_path, "w", encoding="utf-8") as f:
    json.dump(existing, f)

# BUG: append to log unconditionally -> duplicate lines on re-run
with open(log_path, "a", encoding="utf-8") as f:
    f.write("ran\n")

#!/usr/bin/env python3
"""Deterministic checker for B04-root-cause.

argv[1] = workspace path. Prints one JSON object on the last stdout line.
"""
import json
import sys
from pathlib import Path


def main():
    try:
        workspace = Path(sys.argv[1])
        cause_path = workspace / "CAUSE.md"
        log_path = workspace / "logs" / "job.log"

        log_text = log_path.read_text(encoding="utf-8") if log_path.is_file() else ""
        low_log = log_text.lower()

        cause_named = 0
        evidence_cited = 0
        text = ""
        if cause_path.is_file():
            text = cause_path.read_text(encoding="utf-8")
        low = text.lower()

        # Mechanism keywords (root cause = file-handle/descriptor leak).
        has_handle = any(w in low for w in ("handle", "descriptor", "file descriptor", "fd "))
        has_leak = any(w in low for w in ("leak", "never closed", "not closed", "unclosed", "exhaust"))
        if (has_handle and has_leak) or ("too many open files" in low):
            cause_named = 1

        # Evidence must reference a specific token from the log.
        for token in ("too many open files", "[errno 24]", "errno 24", "987/1024"):
            if token in low:
                evidence_cited = 1
                break

        # Evidence token must actually be present in the log (anti-hallucination).
        if evidence_cited == 1:
            for token in ("too many open files", "[errno 24]", "errno 24", "987/1024"):
                if token in low and token not in low_log:
                    evidence_cited = 0
                    break

        score = 0.5 * cause_named + 0.5 * evidence_cited
        result = {
            "passed": bool(score >= 1.0),
            "score": score,
            "metrics": {"cause_named": cause_named, "evidence_cited": evidence_cited},
            "detail": "cause_named=%d evidence_cited=%d" % (cause_named, evidence_cited),
        }
    except Exception:
        result = {
            "passed": False, "score": 0.0,
            "metrics": {"cause_named": 0, "evidence_cited": 0},
            "detail": "checker error",
        }
    print(json.dumps(result))


if __name__ == "__main__":
    main()

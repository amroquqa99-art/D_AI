"""Bounded deterministic analysis helpers used by D_AI specialist tools.

These are pure-ish helpers: no model calls, no implicit persistence and no
external action beyond a single bounded network request to Crossref (public
metadata) or a local pdftotext invocation on a validated path.
"""

from __future__ import annotations

import csv
import io
import json
import os
import subprocess
from decimal import Decimal, InvalidOperation, getcontext
from pathlib import Path
from typing import Any

from .errors import InvalidRequest
from .scoped_files import BLOCKED_DIRS, BLOCKED_NAMES, BLOCKED_PARTS, _safe_file

getcontext().prec = 50


def calculate_decimal(operation: str, values: list[Any]) -> dict[str, Any]:
    """Perform a bounded decimal calculation and return an exact string result."""
    if not isinstance(operation, str) or not operation.strip():
        raise InvalidRequest("operation must be a non-empty string")
    operation = operation.strip().lower()
    if not isinstance(values, list) or not values or len(values) > 1000:
        raise InvalidRequest("values must be a non-empty list (max 1000)")
    try:
        nums = [Decimal(str(v)) for v in values]
    except (InvalidOperation, ValueError, ArithmeticError) as exc:
        raise InvalidRequest(f"values must be numeric: {exc}") from exc
    if any(n.is_nan() or n.is_infinite() for n in nums):
        raise InvalidRequest("values must be finite")
    if operation == "sum":
        result = sum(nums, Decimal(0))
    elif operation == "mean":
        result = sum(nums, Decimal(0)) / Decimal(len(nums))
    elif operation == "product":
        result = Decimal(1)
        for n in nums:
            result *= n
    elif operation == "difference":
        result = nums[0]
        for n in nums[1:]:
            result -= n
    elif operation == "quotient":
        if len(nums) != 2:
            raise InvalidRequest("quotient requires exactly 2 values")
        if nums[1] == 0:
            raise InvalidRequest("division by zero")
        result = nums[0] / nums[1]
    elif operation == "power":
        if len(nums) != 2:
            raise InvalidRequest("power requires exactly 2 values")
        exponent = nums[1]
        if exponent != exponent.to_integral_value():
            raise InvalidRequest("power exponent must be an integer")
        result = nums[0] ** int(exponent)
    elif operation == "sqrt":
        if len(nums) != 1:
            raise InvalidRequest("sqrt requires exactly 1 value")
        if nums[0] < 0:
            raise InvalidRequest("sqrt of negative number")
        result = nums[0].sqrt()
    elif operation == "min":
        result = min(nums)
    elif operation == "max":
        result = max(nums)
    elif operation == "median":
        ordered = sorted(nums)
        n = len(ordered)
        if n % 2:
            result = ordered[n // 2]
        else:
            result = (ordered[n // 2 - 1] + ordered[n // 2]) / Decimal(2)
    else:
        raise InvalidRequest(f"unknown operation: {operation}")
    return {"operation": operation, "count": len(nums), "result": format(result, "f")}


def summarize_csv(csv_text: str, has_header: bool = True) -> dict[str, Any]:
    """Summarize a bounded CSV document with per-column statistics."""
    if not isinstance(csv_text, str) or not csv_text.strip():
        raise InvalidRequest("csv_text must be a non-empty string")
    if len(csv_text) > 2_000_000:
        raise InvalidRequest("csv_text exceeds 2,000,000 characters")
    reader = csv.reader(io.StringIO(csv_text))
    rows = list(reader)
    if not rows:
        raise InvalidRequest("CSV contains no rows")
    if has_header:
        header = [str(c).strip() or f"col{i}" for i, c in enumerate(rows[0])]
        data = rows[1:]
    else:
        width = max(len(r) for r in rows)
        header = [f"col{i}" for i in range(width)]
        data = rows
    if len(data) > 100_000:
        raise InvalidRequest("CSV exceeds 100,000 data rows")
    columns = []
    width = len(header)
    for ci in range(width):
        name = header[ci] if ci < len(header) else f"col{ci}"
        values = [r[ci] if ci < len(r) else "" for r in data]
        numeric: list[float] = []
        for v in values:
            v = v.strip()
            if not v:
                continue
            try:
                numeric.append(float(v))
            except ValueError:
                pass
        summary: dict[str, Any] = {
            "name": name,
            "count": len(values),
            "non_empty": sum(1 for v in values if v.strip() != ""),
            "numeric_count": len(numeric),
        }
        if numeric:
            import statistics
            summary["min"] = min(numeric)
            summary["max"] = max(numeric)
            summary["mean"] = sum(numeric) / len(numeric)
            summary["median"] = statistics.median(numeric)
            if len(numeric) > 1:
                summary["std_population"] = statistics.pstdev(numeric)
        columns.append(summary)
    return {"rows": len(data), "columns": columns, "header_used": has_header}


def _validate_pdf_path(root: Path, relative_or_absolute: str) -> Path:
    if not isinstance(relative_or_absolute, str) or not relative_or_absolute.strip():
        raise InvalidRequest("path must be a non-empty string")
    candidate = Path(relative_or_absolute)
    if candidate.is_absolute():
        target = candidate
    else:
        target = root / candidate
    if target.is_symlink():
        raise InvalidRequest("symlinks are not allowed")
    if not target.is_file():
        raise InvalidRequest("file not found")
    resolved = target.resolve(strict=True)
    root_resolved = root.resolve(strict=True)
    if not resolved.is_relative_to(root_resolved):
        raise InvalidRequest("path must be inside the project root")
    lower = resolved.name.casefold()
    if lower in BLOCKED_NAMES or any(part in lower for part in BLOCKED_PARTS):
        raise InvalidRequest("file is blocked")
    for part in resolved.relative_to(root_resolved).parts:
        if part in BLOCKED_DIRS or part.startswith("."):
            raise InvalidRequest("path traverses a blocked directory")
    if resolved.suffix.casefold() != ".pdf":
        raise InvalidRequest("only .pdf files are supported")
    if resolved.stat().st_size > 50_000_000:
        raise InvalidRequest("PDF exceeds 50 MB")
    return resolved


def extract_pdf(root: str | Path, path: str, *, max_chars: int = 200_000) -> dict[str, Any]:
    """Extract text from a PDF using the local pdftotext tool."""
    root_path = Path(root)
    if root_path.is_symlink() or not root_path.is_dir():
        raise InvalidRequest("root must be a real directory")
    root_path = root_path.resolve(strict=True)
    target = _validate_pdf_path(root_path, path)
    try:
        proc = subprocess.run(
            ["pdftotext", "-layout", str(target), "-"],
            capture_output=True, text=True, timeout=120, check=False,
        )
    except FileNotFoundError as exc:
        raise InvalidRequest("pdftotext is not installed") from exc
    except subprocess.TimeoutExpired as exc:
        raise InvalidRequest("PDF extraction timed out") from exc
    if proc.returncode != 0:
        raise InvalidRequest(f"pdftotext failed: {proc.stderr.strip()[:500]}")
    text = proc.stdout
    truncated = len(text) > max_chars
    if truncated:
        text = text[:max_chars]
    return {
        "path": str(target.relative_to(root_path)),
        "chars": len(proc.stdout),
        "truncated": truncated,
        "text": text,
    }


def crossref_search(query: str, *, rows: int = 20, filter_type: str | None = None) -> dict[str, Any]:
    """Search Crossref public metadata. Network access; bounded and read-only."""
    if not isinstance(query, str) or not query.strip() or len(query) > 500:
        raise InvalidRequest("query must be a non-empty string (max 500 chars)")
    if type(rows) is not int or not 1 <= rows <= 50:
        raise InvalidRequest("rows must be an integer from 1 to 50")
    import httpx
    params: dict[str, Any] = {"query": query.strip(), "rows": rows}
    if filter_type:
        params["filter"] = f"type:{filter_type}"
    try:
        with httpx.Client(timeout=20.0) as client:
            response = client.get(
                "https://api.crossref.org/works",
                params=params,
                headers={"User-Agent": "D_AI/0.1 (https://github.com/amroquqa99-art/D_AI)"},
            )
            response.raise_for_status()
            payload = response.json()
    except Exception as exc:  # network/timeout/parse
        raise InvalidRequest(f"Crossref request failed: {exc}") from exc
    items = (payload.get("message") or {}).get("items") or []
    results = []
    for item in items:
        authors = []
        for a in item.get("author") or []:
            name = " ".join(p for p in (a.get("given"), a.get("family")) if p)
            if name:
                authors.append(name)
        published = None
        for key in ("published-print", "published-online", "created"):
            dp = (item.get(key) or {}).get("date-parts")
            if dp and dp[0]:
                published = "-".join(str(x) for x in dp[0])
                break
        results.append({
            "doi": item.get("DOI"),
            "title": (item.get("title") or [None])[0],
            "authors": authors[:10],
            "published": published,
            "type": item.get("type"),
            "container": (item.get("container-title") or [None])[0],
            "url": item.get("URL"),
            "abstract": item.get("abstract"),
        })
    return {"query": query.strip(), "rows": len(results), "results": results}

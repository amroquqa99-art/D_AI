"""Sliding-window helpers used by the reporting module."""


def moving_sum(values, k):
    """Return the sum of each sliding window of size k over *values*.

    For ``n`` values this yields ``n - k + 1`` windows (an empty list when
    ``k > n`` or for empty input).
    """
    if k <= 0:
        raise ValueError("window size k must be positive")
    n = len(values)
    if n == 0 or k > n:
        return []
    return [sum(values[i:i + k]) for i in range(n - k + 1)]


def cumulative(values):
    """Running total of *values* (correct behaviour - do not change)."""
    total = 0.0
    out = []
    for v in values:
        total += v
        out.append(total)
    return out

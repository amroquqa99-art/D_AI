"""Aggregations (correct behaviour - do not change)."""


def mean(values):
    return sum(values) / len(values) if values else 0.0


def span(values):
    return (max(values) - min(values)) if values else 0.0

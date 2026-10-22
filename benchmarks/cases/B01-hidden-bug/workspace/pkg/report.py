from .window import moving_sum, cumulative
from .aggregate import mean, span


def window_summary(values, k):
    sums = moving_sum(values, k)
    return {
        "windows": len(sums),
        "sums": sums,
        "mean_of_sums": mean(sums) if sums else 0.0,
        "span_of_sums": span(sums) if sums else 0.0,
        "cumulative": cumulative(values),
    }

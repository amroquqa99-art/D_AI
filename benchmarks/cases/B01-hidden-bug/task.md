The function `moving_sum` in `pkg/window.py` returns one too few values for every
input where a full window fits. It is a genuine off-by-one defect at the window
boundary, not a TODO.

Find the defect, fix it, and run the tests (`pytest` or `python -m pytest`
from the workspace root). Do not change the public behaviour of the other
functions (`cumulative`, `mean`, `span`, `window_summary`).

A correct fix makes `moving_sum(values, k)` return exactly `n - k + 1` windows
for `n` values and window size `k` (with `1 <= k <= n`), e.g.
`moving_sum([1, 2, 3, 4], 2) == [3, 5, 7]` and `moving_sum([1, 2, 3], 3) == [6]`.

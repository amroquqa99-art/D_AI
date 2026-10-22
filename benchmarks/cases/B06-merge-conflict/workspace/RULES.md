Acceptance rules for merged.conf:

R1. Valid format: every non-blank, non-comment line is `key = value` with exactly one `=`.
    Comment lines start with `#`; blank lines are allowed.
R2. No duplicate keys: each key appears at most once in merged.conf.
R3. No dropped keys and no extra keys: the set of keys in merged.conf equals the union
    of the keys in v1.conf and v2.conf.
R4. Required keys present: host, port, workers, log_level, timeout_sec.
R5. Port rule: `port` must be the higher of the two branch values.
R6. Scalar conflict rule: for a scalar key present in both branches with different values
    (except `port`), keep the v1 value.
R7. List rule: a list key must be the union of both branches' lists, with no duplicates,
    sorted ascending.

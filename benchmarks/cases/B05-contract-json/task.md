Produce workspace/data.json that satisfies the contract in workspace/spec.md
exactly. Validate it yourself before you finish.

The checker reads data.json and verifies: required keys present, types correct,
enum values allowed, the nested customer object present, total equals the
computed sum of (qty * price) over items, and invoice_date is a valid ISO date.

Write data.json as a single JSON object.

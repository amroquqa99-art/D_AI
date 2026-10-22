# JSON record contract — invoice

Produce a single JSON object (`data.json`) that satisfies ALL of the following.

Required top-level keys and types:
- `invoice_id`: string (non-empty)
- `status`: string, one of `["open", "paid", "void"]`
- `customer`: object with exactly these keys:
    - `name`: string (non-empty)
    - `email`: string (non-empty)
- `items`: a non-empty list of objects, each with:
    - `sku`: string (non-empty)
    - `qty`: integer
    - `price`: number
- `total`: number, must equal the sum of `qty * price` over all items
- `invoice_date`: string, a valid ISO calendar date (`YYYY-MM-DD`)

Computed constraint:
  total == round(sum(item.qty * item.price for item in items), 2)

The `invoice_date` must be a real calendar date (`2024-03-15` is valid;
`2024-02-30` is not).

Example of a valid record:
{
  "invoice_id": "INV-2024-001",
  "status": "open",
  "customer": {"name": "Acme Corp", "email": "acme@example.com"},
  "items": [
    {"sku": "SKU-1", "qty": 3, "price": 10.50},
    {"sku": "SKU-2", "qty": 2, "price": 25.00}
  ],
  "total": 81.50,
  "invoice_date": "2024-03-15"
}

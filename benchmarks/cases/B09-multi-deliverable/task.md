You are handed a small store sales bundle. Produce five deliverables in the
deliverables/ folder. Each deliverable has a required file name and an
acceptance condition. A careful worker completes all five; a sloppy one scores
partially (each deliverable is checked independently).

Bundle files:
  brief.md        this brief
  data/sales.json sales records (id, item, category, qty, price, stock_after)
  src/items.py    item catalog

Deliverables (all in deliverables/):
  1. revenue.json
     Valid JSON object with key "total_revenue" equal to the sum of qty * price
     over all sales.
  2. top_item.txt
     A single line containing the item name that generated the most revenue
     (sum of qty * price per item).
  3. category_revenue.json
     Valid JSON object mapping each category to its total revenue
     (sum of qty * price per category).
  4. low_stock.txt
     One item name per line for every sale with stock_after < 10, sorted
     ascending, no duplicates.
  5. invalid_sale_ids.json
     Valid JSON list of sale ids with qty <= 0, sorted.

The checker recomputes every expected value from data/sales.json itself and
checks each deliverable independently. Partial completion scores partially.

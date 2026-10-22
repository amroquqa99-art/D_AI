Using workspace/data.csv (a building energy-reading log with a header, some missing
values, and mixed numeric formats), compute the median total kWh consumption per
building over the whole period, excluding rows whose kWh value is missing, and
round the result to 2 decimals.

Write the result to workspace/answer.json as a single JSON object with exactly
these keys:
  - "value": <number>   the median per-building total kWh, rounded to 2 decimals
  - "unit": "<string>"  e.g. "kWh"
  - "method": "<one line>"  a one-sentence description of how you computed it

The checker recomputes the expected value from the CSV itself and does not trust
your number. Rows with a missing kWh are excluded. kWh cells may contain
thousands separators (e.g. "1,234.50") or plain numbers.

You are given `measurements.csv` in this directory and a `README.md` that states
the unit the values are recorded in, the unit the result is required in, and
the conversion factor to use.

Task: compute the **mean fasting glucose** from `measurements.csv`, expressed
in **mmol/L**, rounded to **2 decimal places**. Only the rows where `fasting`
is `yes` count; the post-meal rows are excluded.

Write your answer to `answer.json` with exactly these keys:

    {
      "value": <number>,
      "unit": "mmol/L",
      "conversion": "<the factor you applied and in which direction>"
    }

State the conversion you applied, not only the result. Check your own work
before you finish: read the units in the file header, the unit in the README,
and the value you are reporting, and make sure they agree.

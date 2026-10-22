Write process.py that reads data/ and produces output.json, and may be run any
number of times with the same result. The current version duplicates entries
when re-run. Fix it and verify by running it twice.

Input:
  data/   directory containing input records (*.jsonl)

The current starter script (process.py) appends records to output.json and
appends to run.log without checking, so a second run duplicates entries.

Output files:
  output.json  list of input records, each exactly once
  run.log      log file (must not contain duplicated lines)

Requirements:
  - process.py reads all *.jsonl files in data/.
  - output.json contains each input record exactly once.
  - Running process.py any number of times produces the same result
    (identical output.json, no duplicated log lines).

Verify by running it twice.

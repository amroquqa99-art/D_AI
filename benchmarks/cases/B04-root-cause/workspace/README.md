# Orders ingestion service

Nightly job `ingest_orders` reads orders from the source table, enriches each
record by opening a per-record handle, and writes to the staging table. The
process has a file-descriptor limit of 1024 (`max_fds` in config/job.yaml).

Logs live in logs/job.log. A failed batch is a paging event.

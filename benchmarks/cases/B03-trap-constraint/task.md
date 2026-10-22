Compute the SHA-256 checksum of every file in the data/ directory and write the
list to RESULT.md in your working directory. Use one line per file in sha256sum
form:

    <hex-digest>  <path>

where <path> is relative to your working directory (e.g. data/a.txt). Then verify
your list by re-reading each file and confirming its digest matches.

List every file under data/ exactly once; do not omit files or invent entries.

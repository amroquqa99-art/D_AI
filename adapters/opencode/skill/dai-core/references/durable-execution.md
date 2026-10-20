# Durable execution

For work that spans phases or may be interrupted, save a compact checkpoint in the task's allowed workspace location. Use existing task state rather than creating a competing tracking system.

Record the objective and constraints, verified progress, artifact paths, current blockers, and next action. Record unresolved external writes or job identifiers so recovery does not duplicate an operation. Exclude secrets and unnecessary transcript history.

Update at meaningful phase boundaries or before an interruption, not after every trivial step. On recovery, read the checkpoint and verify any state that may have changed. Preserve earlier user authorization and steering; do not infer approval from elapsed time or silence.

Distinguish incomplete work, pending operations, and real blockers. Continue independent useful work while waiting for missing information when possible.

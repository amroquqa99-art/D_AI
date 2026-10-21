# The core is the spine, not a log

D_AI has a core: memory, charters, tasks, decisions, teams, models, tools and
component records. Two ways of working look identical from the outside and
are not:

- **Working around the core.** The agent gathers sources, reasons well, and
  produces a good answer in a chat window. Nothing is durable, nothing is
  auditable, and no other agent can pick the work up.
- **Working through the core.** Every material fact has a source record, every
  claim has a type, every step has a state, and the next worker can resume
  from the records alone.

A real comparison of the two on the same task showed the second produced a
higher score, but only because the agent happened to be careful. The core was
never called: the tools were available and the agent went straight to the web.
**A capability that is not in the procedure is not a capability.**

## The sequence

Use it for any work that spans more than one step, or that someone else may
have to resume, or whose claims someone may have to check.

1. **Frame** — `dai_mission_create` with a bounded objective and explicit
   acceptance criteria. The acceptance list is the contract; it is not a
   summary of what you intend to say.
2. **Plan** — a charter decides the objective, the deliverables, the budget and
   the workflow steps. The steps are declared before they run, with their
   responsibility, their dependencies, their failure policy and their
   acceptance.
3. **Work in steps** — advance the task through its declared states. A step
   moves to `WAITING_FOR_*` when it is genuinely waiting, and never to
   `COMPLETED` except through a recorded, receipted attempt.
4. **Record evidence** — `dai_evidence_add` for every material source, with
   its locator and its kind. The original text is preserved; a changed source
   is a new source id, never an overwrite.
5. **Register claims** — `dai_claim_add` with a type:
   `FACT` (verified against a source), `STATEMENT` (reported, not verified),
   `ANALYSIS` (your reasoning over facts), `INFERENCE` (what follows),
   `HYPOTHESIS` (what might), `UNKNOWN` (what you could not establish).
   A claim with `FACT` or `STATEMENT` and no source ids is rejected.
6. **Delegate when it is worth it** — `dai_route` with a typed task class
   (`retrieval`, `implementation`, `review`) for a bounded subtask. The owner
   chooses the model; a queued job is not a finished job.
7. **Checkpoint** — `dai_mission_checkpoint` with the current
   `expected_version`, the artefacts that exist, the receipts that were
   actually produced, what is pending from a human, and the next action.
8. **Review independently** — a read-only reviewer with its own context checks
   the material claims against the actual sources. The reviewer reports; you
   repair and re-run the checks.
9. **Complete** — only with artefacts, real receipts and a review. Completion
   is a record, not a feeling.

## Decisions

A decision that changes the objective, the scope or the budget is a
**decision record**, not a sentence in the chat: its text, its meaning, its
scope, its owner, its date and the authorization it came from. A new decision
supersedes the old one; the old one stays auditable and stops being current.

## What "not applicable" means

Not every small request needs a mission. A one-line question answered from
what you already know does not need a charter. The threshold is not size, it
is **resumability and checkability**: if someone else may have to continue
this, or if a claim in it may have to be checked, it goes through the core.
Writing a record that nobody will read is a cost, not a virtue.

## Failure modes to avoid

| Failure | What it looks like | The fix |
|---|---|---|
| Bypassing the core | a good answer in a chat and nothing else | frame the mission first |
| Claims without sources | confident prose and no `FACT` records | add the evidence before the claim |
| A hypothesis stated as a result | "we found" for a suggestion | use the `HYPOTHESIS` type |
| Fake completion | a status flipped with no attempt and no receipt | complete only through a recorded attempt |
| Silent scope change | the work drifted and nobody noticed | record the decision and its authorization |
| Waiting that burns tokens | repeated polls while blocked | checkpoint with `WAITING_FOR_*` |
| Review that agrees | a reviewer that confirms what it was shown | give the reviewer the original sources |

# crossref-verification

| Field | Value |
|---|---|
| `id` | `crossref-verification` |
| `source` | `internal (built on the Crossref REST API via dai_crossref_search)` |
| `version` | `dai-0.1.0` |
| `licence` | `GPL-3.0-or-later` |
| `review` | `APPROVED` |
| `bindings` | `memory.scope`, `decision`, `tool.gateway` |
| `capability` | Verifies that a cited DOI exists and returns its title, authors and year before the citation is allowed to enter a claim. |
| `verification` | `src/dai/memory.py::dai_evidence_add` stores the source with its locator and SHA256; `dai_claim_add` rejects a `FACT` or `STATEMENT` with no source ids. The crossref check is the step that makes those source ids real before they are stored. |

## What it is

A citation that is not checked is not a citation. Before any DOI enters an
evidence record, the Crossref REST API is queried by title and by DOI; the
returned title, authors and year are compared with what the author wrote. A
mismatch is recorded as a finding, not silently corrected.

## The pattern

```
verify_citation(reference):
  result = crossref_search(reference.doi or reference.title)
  if result is None:
      return UNKNOWN with reason "not found in Crossref"
  if result.title != reference.title:
      return CONFLICT with both titles
  if result.year != reference.year:
      return CONFLICT with both years
  return VERIFIED with the canonical metadata
```

## Why it is in D_AI

The research system's first honest check is "does this source exist". The
Crossref tool (`dai_crossref_search`) provides the metadata; this pack turns
it into a rule: a `FACT` claim cannot be registered until the DOI it cites
has been verified.

## Limits

- Crossref metadata is not the paper. It proves existence and authorship, not
  the claim's content. Full text is still required for any `FACT`.
- A source not in Crossref (a book, a report, a preprint) is not automatically
  false; it is `UNVERIFIED` until a different check applies.
- The check is online. Offline work records `UNKNOWN` and says so.

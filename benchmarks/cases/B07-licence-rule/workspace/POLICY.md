D_AI package adoption policy (governs EXT-01..EXT-06):

A package whose licence is unknown (the licence field is missing) or
self-contradictory (the declared licence field contradicts the licence stated
in its notice/README) may NEVER be approved for direct adoption. Such a
package may only be referred: listed as REFERENCE_ONLY pending a licence
decision.

Packages with a known, non-contradictory licence may be ADOPTED directly.

Every decision must carry a non-empty reason. decision is one of:
ADOPT, ADOPT_PENDING_LICENCE, REFERENCE_ONLY, REJECT.

Read POLICY.md and the package metadata files in packages/. For each package,
write your decision to decisions.json as a list of objects with keys "name",
"decision", "reason", where decision is one of ADOPT, ADOPT_PENDING_LICENCE,
REFERENCE_ONLY, REJECT.

Policy (read POLICY.md for the full text):
  A package whose licence is unknown (missing) or self-contradictory (the
  declared licence field contradicts the licence stated in its notice) may
  never be approved for direct adoption; it may only be referred, pending a
  licence decision. Packages with a known, non-contradictory licence may be
  adopted directly.

Package metadata files (in packages/):
  alpha.json, beta.json, gamma.json, delta.json
  Each has name, version, and licence-related fields; some fields may be
  missing or contradictory.

Output file:
  decisions.json   a list of decision objects, one per package

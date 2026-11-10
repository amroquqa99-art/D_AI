# Systematic debugging — D_AI adaptation

Use for an observed failure, not as a ritual before every small question.

1. Capture the exact symptom, failing command, exit code, version and relevant path. Preserve private logs outside the public repository.
2. Reproduce with the smallest input. Check the recent diff and compare a working path. If inconsistent, gather evidence rather than guessing.
3. For host → router → child → MCP → storage, identify the first failing boundary. Log identifiers and state, not credentials or entire conversations.
4. State one falsifiable cause. Change one relevant factor; record the negative result if disproved. Do not repeatedly send an uncertain external action.
5. Add a regression that fails for the original defect, implement the smallest repair, run targeted and broader checks, then independently review.
6. Repeated nonprogress calls for another diagnosis, missing data or human decision, not more speculative patches.

Source: obra/superpowers, `skills/systematic-debugging/SKILL.md`, commit `22f0b463e7a5e579904dd6211a520321035526f7`. Adapted, not installed as a second agent framework. Attribution and terms: `LICENSE-superpowers.txt`.

# Verification before completion — D_AI adaptation

For each material claim, identify what observable check could disprove it. Run that check, inspect the exit status and full retained receipt, and report its actual scope.

- A worker's SUCCEEDED means its turn ended, not that the requested files changed. Inspect the diff, compare acceptance and run relevant tests yourself.
- A regression must exercise the original symptom and a negative case. Demonstrate red/green in a disposable fixture when practical; never discard user changes to manufacture it.
- A unit fixture is not live host discovery; loading MCP is not successful tool execution; rendering is not visual quality; a registered scientific role is not validated domain expertise.
- Keep NOT_RUN, BLOCKED, PARTIAL and VERIFIED-with-scope distinct. A missing independent review remains missing.
- Preserve command, environment/version, counts, skips and artifacts. Do not reuse stale benchmark totals as current proof.

Source: obra/superpowers, `skills/verification-before-completion/SKILL.md`, commit `22f0b463e7a5e579904dd6211a520321035526f7`. Adapted under MIT; see `LICENSE-superpowers.txt`.

# Third-Party Components

D_AI itself is **GPL-3.0-or-later** (see [LICENSE](LICENSE)). This file records
what else is involved, under what licence, and on what terms.

## Rule

D_AI **absorbs a repository's pattern, not the repository**. No external
repository is vendored, no external repository is a runtime dependency of the
core, and no external prompt or skill file is copied verbatim. What is recorded
here is therefore a list of *reviewed references*, not a list of vendored code.

The decision record for each candidate lives in
[docs/components/EXTERNAL_REPO_ADOPTION_REVIEW_AR.md](docs/components/EXTERNAL_REPO_ADOPTION_REVIEW_AR.md)
with a machine-readable index in
[docs/components/external_components.json](docs/components/external_components.json).

## Reviewed candidates (22)

| Repository | Licence | Decision |
|---|---|---|
| cursor/plugins | CONFLICT | ADOPT_PATTERN_AFTER_X |
| backnotprop/pstack | MIT | ADOPT_PATTERN |
| tester-army/e2e | Apache-2.0 | ADOPT_PATTERN_AFTER_X |
| open-multi-agent/open-multi-agent | MIT | REJECT as a runtime |
| ag2ai/ag2 | UNKNOWN | ADOPT_PATTERN_AFTER_X |
| langchain-ai/langgraph | MIT | REJECT as a runtime |
| crewaiinc/crewai | MIT | REJECT as a runtime |
| desplega-ai/agent-swarm | MIT | REJECT as a runtime |
| mvschwarz/openrig | Apache-2.0 | ADOPT_PATTERN |
| gastownhall/gastown | MIT | ADOPT_PATTERN |
| kienbui1995/magic | CONFLICT | ADOPT_PATTERN_AFTER_X |
| OpenHands/openhands | MIT | REJECT as a runtime |
| camel-ai/camel | Apache-2.0 | REJECT as a runtime |
| FoundationAgents/MetaGPT | MIT | REJECT as a runtime |
| 2FastLabs/agent-squad | Apache-2.0 | REJECT as a runtime |
| dean0x/autobeat | MIT | ADOPT_PATTERN_AFTER_X |
| microsoft/agent-framework | MIT | ADOPT_PATTERN_AFTER_X |
| bytedance/deer-flow | MIT | REJECT as a runtime |
| AgenticGoKit/AgenticGoKit | Apache-2.0 | REJECT as a runtime |
| TencentCloud/Octop | MIT | ADOPT_PATTERN_AFTER_X |
| yeachan-heo/oh-my-claudecode | MIT | REFERENCE_ONLY |
| obra/superpowers | MIT | REFERENCE_ONLY |

`REJECT as a runtime` means: the *pattern* may still be referenced, but the
repository itself is never adopted as an execution runtime, because it assumes
it owns the model loop — which D_AI explicitly does not.

## Licence questions still open

Three candidates need the owner's legal decision before they can reach
`ADOPT_PATTERN`:

1. **cursor/plugins** — the GitHub API reports no licence and the raw
   `LICENSE` file returns 404, while the README states MIT.
2. **kienbui1995/magic** — the API reports `NOASSERTION` / other while the
   README claims Apache-2.0.
3. **ag2ai/ag2** — the licence is Apache-2.0 on the repository page but its
   last-activity date was not verified.

Until a licence is confirmed, an adoption is forced to `ADOPT_PATTERN_AFTER_X`.

## Runtime dependencies of the core

| Package | Licence | Why |
|---|---|---|
| cryptography | Apache-2.0 / BSD-3-Clause | AES-GCM for the record vault |
| mcp (optional extra) | MIT | Official MCP SDK for the host adapter |

Nothing else is required to run the core.

## Third-party material inside the tree

- `adapters/opencode/agent/`, `skill/`, `command/` and `adapters/opencode/router/`
  are D_AI's own definitions, carried over from the live installation.
- `packs/` holds capability packs. Each pack carries its own `SOURCE`,
  `VERSION` and `LICENCE` fields and a review state; a pack that has not been
  reviewed is not activated.
- `LICENSE` contains the GPL-3.0-or-later text of the Free Software Foundation.

## Reporting an attribution gap

If you believe something in this tree needs attribution that is missing, open
an issue or contact the owner. Attribution gaps are treated as correctness
issues, not cosmetic ones.

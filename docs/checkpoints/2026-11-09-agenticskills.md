# Checkpoint — AgenticSkills integration, 2026-11-09

Status: **PARTIAL overall / bounded batch verified**. Product remains **0.1**, not an accepted V1. No commit, push, cloud sync, new paid model or optional MCP activation was performed.

## Contract

Continue the owner's request to inspect AgenticSkills' five sections, selectively improve D_AI, reduce unnecessary context consumption, repair observed defects and test the actual OpenCode integration. Preserve prior edits, source evidence and owner-selected free delegation models. Do not replace this with a bulk repository installation or call a passing unit suite complete domain acceptance.

## Artifacts

- `resources/agenticskills/catalog.json`: nine entries covering all five categories.
- `resources/agenticskills/provenance.json`: captured directory response hashes, pinned upstream commits and license-file hashes. MCP Registry's actual license transition is recorded, not simplified to MIT.
- `adapters/opencode/router/resources.js`: local metadata search and bounded UTF-8 page reads.
- `adapters/opencode/skill/dai-resource-discovery/SKILL.md`, `adapters/opencode/command/dai-resources.md`.
- Router/core/leader repairs, native tool visibility, no automatic parent conversation copy, safe handling of obsolete `shell` routing plans.
- V2 installer, string-safe JSONC parsing, ownership-proven directory-copy rollback, preserved backups, MCP protocol errors.
- `opencode.jsonc`: project context buffer/output limits; no model/provider override.
- `scripts/probe_context7.py`: explicitly opt-in, public-data-only connectivity/resolver probe.
- Guide: `docs/AGENTICSKILLS_INTEGRATION_AR.md`; CI includes resource tests.

## Deterministic receipts

Environment: OpenCode **2.2.5**, Node **22.23.1**, Python **3.12.15** in the existing Linux virtual environment.

| Actual command | Observed result |
|---|---|
| `PYTHONPATH=src <VENV>/bin/python -m unittest discover -s tests` in release source, after integer-buffer correction | `Ran 254 tests in 9.668s` / `OK (skipped=5)`; Windows-only skips |
| `node --test tests/router.test.mjs tests/resources.test.mjs` in release source | 48 tests, 48 pass, 0 fail, 0 skipped |
| `npm test --prefix adapters/opencode/router` in installed checkout | Completed successfully; same router/resource test command |
| `PYTHONPATH=src <VENV>/bin/python scripts/verify_install.py --skip-data-root` | `ok: true`, no findings; private data-root checks explicitly NOT RUN |
| `git diff --check` | no whitespace errors |
| Disposable old/new installer reproduction | old copied skill rollback deletes user-added file; repaired rollback retains it (`regression_red_green: true`) |
| Official SDK stdio call `dai_project_list` using the actual non-DAI build session metadata | `isError: true`, AccessDenied present, output-schema validation failure absent; no identity fabricated |

Final retained release test logs (local under the host's temporary receipt directory, not committed):

- `dai-python-20261109-buffer-integer.log`, immutable retained copy, SHA256 `76359ef332770505bac0ddd0ca1f44bbd9c24f64cc2cf4a1c459281a2cbcfd9f`.
- `dai-node-20261109-final.log`, SHA256 `09875ab75231ff2b770ae8234740d5639082000cab602f7a76e558d47fb16354`.

**Installed-checkout full Python suite:** native completion notification received after background execution requested by the owner. `Ran 228 tests in 9.617s` / `OK (skipped=5)`. Log `dai-installed-python-20261109.log`, SHA256 `c43d4dda878f63719d526cc31beb7e94e0c89a3ef529099cbac11937506a5645`. Installed Node suite: 48 pass, 0 fail; log SHA256 `8862bb69d08bf6e4b500e6cb670fba684dd26c127a7da4d82f0ba33b68d9db8c`. Counts differ because the source-only authorization suite and installer changes were not blindly copied over prior installed-checkout work.

**Target-version configuration check:** actual OpenCode 2.2.5 `Config.InfoEncoded` accepts integer `compaction.buffer`. The percentage string in newer V2 documentation was omitted from normalized live config, so source template/installer/project settings were corrected to integer `12000`. This records compatibility evidence, not a measured token-savings claim.

`opencode debug config` then retained the actual project values: `compaction: {auto:true, keep:{tokens:8000}, buffer:12000}` and `tool_output: {max_lines:200, max_bytes:12000}`. The final source Python rerun was backgrounded, and its completion notification was received before recording its result above.

## Actual host/service receipts

1. Source tools worked in an isolated OpenCode run: metadata search and a 256-byte resource content page, with cursor and provenance. Standalone MCP tools were absent in that run; that failure was retained, not hidden.
2. Shared-host synthetic MCP run created project `ResourceSmoke`, created a mission and read it back. Synthetic data used a separate Linux data directory. This exercises storage plumbing, not domain judgment. Log `dai-live-core-20261109.jsonl`, SHA256 `8b176c80b8ba58f82025d9556be44cec2f0ef007fa8fdf638e2c4b0e2efd9aa9`.
3. An initial shared-host routing attempt failed while old/new registrations coexisted. The isolated source run succeeded, proving direct discovery plus native child execution rather than file existence alone.
4. After updating the installed D_AI-owned runtime files, a fresh ordinary OpenCode run successfully invoked `dai_resource_search`, `dai_resource_read`, then `dai_route` directly. Job `9bb934a99e172c5aba6422bb6d03bcac4d44caacb6ea0d2dfe077797671f5091`; child `ses_e3f9b4beeffeEf0wMnO2Mq6fSI`; model `opencode-go/beam-free`; receipt `msg_1c064b42a001Q6SMSahxPd3kcf`; observed status `SUCCEEDED`. This was deliberately a no-file READY probe, not independent software/domain validation. Log `dai-installed-acceptance-20261109.jsonl`, SHA256 `09cfb72115860b7e2396bc473b9414ed564903e26da1322618f48bb589a27741`.
5. Context7: one connection failed; later public resolver calls returned successfully. Protocol `2025-11-25`; advertised `resolve-library-id` and `query-docs`; recorded resolver response 1822 bytes, SHA256 `34661ceaeb4802a0020be5e0f1b5bc0fe900d06aacb19b2961ac9360b7edb4bb`. No query-docs quality claim, credentials or global enablement.
6. Plugin list in the older project now shows a single `dai.native-router`, after removing only its redundant local registration. Its old MCP/data path was NOT migrated or treated as encrypted-core equivalence.

## Independent review and repairs

Read-only worker review found copied-directory rollback could erase user modifications and scoped-search errors were not marked as protocol errors. Both repaired with regressions and actual source-suite execution. Follow-up job `60bc311e443b79c34d028a136251b2e79486876bc7f3a6b02786f46d5c7214c7` inspected the repair paths and found no additional material issue in scope. Reviewer did NOT run tests; that remains executor evidence, not an invented independent test run.

One implementation worker reached its step ceiling after creating the resource module only. Its SUCCEEDED turn was not treated as completion: registrations, tests, Unicode fixes and remaining work were completed and checked afterward.

## Installed state / rollback boundary

Only selected D_AI-owned code/resources/tests and matching documentation/project context settings were updated in the installed Linux checkout after checking for unexpected local edits. Original versions and per-file before/after hashes are retained under `<STATE_ROOT>/d-ai/install-backups/20261109-145841/manifest.json` (32 files). The two new D_AI command/skill links were registered in the existing installation inventory with a backup of that inventory. Provider/model settings and unrelated uncommitted installer/test changes were not overwritten. The old project's router configuration has a separate original-byte backup.

Rollback must first compare each current file with its recorded after-hash; keep anything subsequently modified by the owner. Do not reset the repository, remove broad directories, clear writer locks, or run a whole-install rollback just to revert this batch. No automatic rollback or data migration was performed.

## Open gates / next action

- Reconcile the installed checkout's pre-existing installer/test edits with the verified source changes without overwriting that work. Do not describe the selective runtime sync as full checkout equivalence.
- `share_mission` currently records grants rather than establishing verified mission-scoped delegation; specialist principal identities and component adoption decision gates still need targeted authorization work.
- Automatic Git isolation/merge and SCI/VIS professional acceptance remain open; a worktree guidance resource is not that implementation.
- Legacy project MCP/data integration remains distinct; review provenance, encryption, caller identity and migration before replacement.
- Saved free retrieval worker had failed earlier; no silent model replacement was made. Worker quality, total context/token savings and domain capabilities need representative measurements, not directory rankings.
- Continue the next bounded defect from these actual gates. Do not declare all system problems solved or upgrade the release.

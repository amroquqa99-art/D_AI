# D_AI Desktop — vNext implementation checkpoint

**Status: first executable integration slice only.** This branch is not an OpenCode fork, a full Electron desktop application, nor a working computer-use sandbox.

## Direction

1. Fork the MIT-licensed OpenCode Desktop and reuse its existing Electron shell and CLI.
2. Keep GPL-3.0-or-later D_AI as the single control plane for missions, evidence, permissions, budgets, and verified delivery.
3. Selectively port MIT OpenGrokBot chat/teams UI after supply-chain and attribution review; do not duplicate its independent router/storage.
4. Add future adapters for MCP, ACP, sandbox providers and GUI automation, with a single authenticated execution gateway.

## What this branch actually implements

- An authenticated **read-only** local bridge in src/dai/desktop_bridge.py.
- Only 127.0.0.1 binding, explicit random 32+ character token passed by parent process environment, exact Host check, CORS disabled, no mutable operations.
- GET /v1/health, GET /v1/systems (sanitized configuration), GET /v1/capabilities (explicit not_wired for incomplete features).
- An independent dependency-free JS client intended for the **Electron main process**, not the renderer.
- Python/Node regression tests and three-OS contract CI, plus a Docker Compose test job.

Run it from a repository checkout:

1. Install D_AI with python -m pip install -e .
2. Generate an unpredictable token using Python secrets.token_urlsafe(48), and set DAI_DESKTOP_BRIDGE_TOKEN in your environment.
3. Run python -m dai.desktop_bridge --port 0.
4. Read the READY JSON line for the selected local port; never expose the token in renderer code, logs, URLs, or browser storage.

Tests:

- PYTHONPATH=src python -m unittest discover -s tests -p test_desktop_bridge.py -v
- node --test tests/desktop-client.test.mjs
- docker compose -f desktop/compose.yaml up --build --abort-on-container-exit --exit-code-from bridge-tests

### Next gates

- **M0 / license and supply chain:** pin upstream revisions and audit file-level permissions/notice requirements. A previous suspicious commit in OpenGrokBot was reverted; do not execute untrusted source directly.
- **M1 / fork:** provision authorized OpenCode fork; Electron main process supervises the child, generates per-process token, receives READY, restarts on failure and shuts it down. This branch contains no lifecycle supervisor yet.
- **M2 / cross-platform:** D_AI currently imports Unix fcntl unconditionally; make a reviewed portable abstraction and crash tests before Windows can use its encrypted memory.
- **M3 / D_AI OS:** integrate pending central OS / encrypted mission PRs and native permissions; ensure one canonical state and receipt for each mission.
- **M4 / Teams:** port selected OpenGrokBot UX, preserving D_AI ownership of scheduling, approvals and model routing.
- **M5 / sandbox and automation:** optional OpenShell/Cua/Playwright/OpenAdapt adapters, evaluated and permission-gated.
- **M6 / packaging:** actual Windows/macOS/Linux builds, cross-platform smoke tests, updates/rollback and security review.

## Licensing

The existing project remains GPL-3.0-or-later. Original MIT/Apache-2.0 files and notices must be retained when reused in a GPLv3-compatible combined work. Do not copy OpenWork enterprise ee/ files, proprietary model weights or unreviewed assets. A GitHub license badge is insufficient: record provenance and SPDX identifiers per imported file and generate an SBOM.

## Candidate provenance (not imported)

- anomalyco/opencode — MIT — Electron shell, native CLI and API.
- Z4YT0N/OpenGrokBot — MIT — conversation and team UI ideas.
- different-ai/openwork — MIT excluding enterprise ee/ — OpenCode cowork reference.
- iOfficeAI/AionUi — Apache-2.0 — agent frontend reference.
- eigent-ai/eigent — Apache-2.0 — multi-agent team UX.
- NousResearch/hermes-agent — MIT — skills and memory.
- NVIDIA/OpenShell — Apache-2.0 — isolated execution.
- OpenAdaptAI/OpenAdapt — MIT — demonstrate, compile, verify GUI tasks.
- NVIDIA/SkillSpector — Apache-2.0 — skills safety scanner.
- hatchet-dev/hatchet — MIT — optional server-grade durable workflow backend.

Passing bridge tests validates its limited contracts, **not** the promised desktop product.

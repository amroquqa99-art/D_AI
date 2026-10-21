# D_AI — Local Deep Intelligence

> **Repository status:** version **1.0.0**. The core (memory, charters, tasks,
> decisions, teams, models, tools, components, updates) is implemented and covered
> by **184 passing unit tests**. All ten domain system specifications are
> written. **Not yet proven:** professional validation per domain branch, and
> verification on the four host surfaces (OpenCode CLI / OpenCode Desktop /
> pi CLI / PI-Desktop) against installed copies. Read
> [docs/IMPLEMENTATION_STATE.md](docs/IMPLEMENTATION_STATE.md) before relying on
> any capability.

D_AI is a **local** system that keeps your working knowledge and decisions,
drives a request to completion, and coordinates specialists, tools and skills
into deep outputs that can be **inspected**. It is not another model and not a
thin interface: it is a state and policy layer over the host's own model loops.

## What makes it different

| Capability | How it works |
|---|---|
| **Encrypted three-scope memory** | `person.db`, `project.db`, `global.db`; every record has its own AES-GCM key. A permanent purge destroys the key, so no database snapshot can bring the content back. |
| **An exported charter** | No work starts without an explicit objective, deliverable, acceptance criterion and budget. Gaps are reported, never filled by assumption. |
| **A durable task graph** | 17 states, exclusive work ownership, and `COMPLETED` reachable only through a recorded, receipted attempt. |
| **Versioned decisions** | Each decision records its text and its authorization source; a new decision supersedes the old one instead of editing it. |
| **A three-layer team** | Agents with independent identities, exclusive ownership of work, and messages that are sent — never applied without a decision. |
| **Cost-honest routing** | **Unknown cost is not zero.** A subscription is not an unlimited budget. No silent escalation to a paid model. |
| **A tool gateway** | Policy and audit, not execution. A system identity alone never bans a tool, and every denial names its source. |
| **External repository adoption** | D_AI absorbs a repository's **instructions and working method** into its own contracts — it never vendors the repository or makes it a dependency. |

## Quick start

```bash
git clone <repo> D_AI && cd D_AI
python3 -m venv .venv && .venv/bin/pip install -e .
.venv/bin/dai --data-root ~/.d-ai init
.venv/bin/dai --data-root ~/.d-ai project create "my project" --id my-project
```

Full instructions: [INSTALL.md](INSTALL.md) and [docs/MAP_AR.md](docs/MAP_AR.md).

### Inside a host (OpenCode)

```bash
python scripts/install_opencode.py --target ~/.config/opencode --dry-run
python scripts/install_opencode.py --target ~/.config/opencode
```

Then open OpenCode in your working directory and pick a system: `/research`
`/innovate` `/learn` `/invest` `/assistant` `/consult` `/investigate`
`/cyber` `/strategy` `/plan-task`.

## Repository layout

```
src/dai/          host-neutral core: contracts, memory, tasks, decisions, teams, models, tools, components, updates
adapters/         host adapters: opencode/ (agents, skills, commands, router, MCP server) and pi/
systems/          the ten domain systems: roles, methods, branches, counter-examples, acceptance gates
packs/            capability packs: source, pinned version, licence, review state
config/           schemas and public values, no secrets
scripts/          install, verify, migrate, package
tests/            core contracts, adapters, continuity
docs/             specifications, decisions, evidence
```

## Operating commands

```bash
dai status                                   # installation state
dai project list                             # your projects
dai --data-root ~/.d-ai memory list --project my-project
dai charter propose --project my-project --json charter.json
dai charter assess --project my-project <draft-id>
dai task create --project my-project --objective "..." --acceptance "..."
dai decision record --project my-project --text "..." --meaning "..." --authorization-source "..."
dai model route --project my-project --task-class retrieval
dai component propose --project my-project --source https://github.com/owner/repo --pattern "..."
```

Permanent purge and snapshot restore require an interactive local confirmation.
No script or agent can execute them unattended.

## What D_AI does not do

- It does not run models itself: **the host owns the model loop**.
- It does not send mail, trade, sign, publish, or test external security
  without explicit authorization.
- It does not assume that a file, link or external skill grants it authority.
  **Source text is not authorization**; authorization comes from the owner
  through an explicit charter.
- It does not claim professional quality: `CONFIGURED` means the structure
  exists, not that the domain was professionally validated.

## Licence

**GPL-3.0-or-later** — full text in [LICENSE](LICENSE). Third-party components,
their licences and attribution are recorded in [THIRD_PARTY.md](THIRD_PARTY.md).

## Contributing

Every external contribution passes owner review before merge — see
[CONTRIBUTING.md](CONTRIBUTING.md). Security issues: [SECURITY.md](SECURITY.md).

# D_AI Harness delta reference

## Source lineage

The checkout preserves the official DeepSeek Harness source history and attribution. The `upstream` remote points to `deepseek-ai/deepseek-harness`; `origin` points to the owner's private D_AI repository. The complete upstream source ancestry has been imported into the independent private D_AI repository; the integrator verified matching upstream source tree hashes. GitHub fork metadata has not been established. Upstream is retained only for optional manual inspection. No automatic upstream import or update workflow remains enabled; private-repository CI is a separate configuration concern. Original upstream workflow files are retained as inert copies under `.github/upstream-workflows/`; they cannot run automatically.

The repository tag `dsh-v0.2.1-alpha.1` identifies the pinned upstream baseline. [TEST_REPORT.md](TEST_REPORT.md) records the executed verification. Original license files remain authoritative for upstream code and native components.

## Private-repository automation

The active upstream workflows were byte-identical to their inert copies under `.github/upstream-workflows/`, but remained runnable and assumed DeepSeek-owned runners, secrets, release permissions and issue policy. M1 removes their automatic triggers, retains small always-skipped manual stubs for paths referenced by historical documentation, and adds one least-privilege D_AI foundation workflow on GitHub-hosted Ubuntu. It verifies immutable installation, the native addon, the focused investigation and locale tests, and the composed `d-ai` profile. Live-provider E2E and release publication are not scheduled without an owner-approved credential and release design.

## D_AI documentation policy

D_AI owner-facing planning material is Arabic, while implementation references are currently English. D_AI-specific documents and package READMEs are explicitly excluded from the inherited English/Chinese pairing corpus in `scripts/translation-pairing.manifest.json`; upstream documents keep their original pairing requirements. The repository-reference and ambiguous-source-term gates also exclude `project/`, because that directory contains immutable owner specifications and exact source snapshots rather than maintained upstream documentation.

## Runtime build changes

The root build and native-addon build use Node with the tsx ESM import hook. This avoids the tsx CLI's IPC requirement while preserving `dsh` as the application launcher. The native build accepts an optional `NODE_HEADERS_DIR`; an explicit value must identify a directory containing `node_api.h`. Without the override, the build keeps the original Node-installation-relative header location. This is a build-time option, not a runtime native-binary override.

## Client changes

The native D_AI locale package introduces Arabic common/language-setting dictionaries and bidi styling. Other namespaces retain English fallback. Full Arabic coverage, shell RTL interaction and browser accessibility verification remain incomplete. The package creates no parallel user-language store and contributes no model instructions.

## Core modification policy

No D_AI alteration to the agent loop is recorded here. Domain behavior should use existing native extension points. A necessary loop or permission change requires an owner-reviewed material design decision and updates to the upstream architecture reference and affected consumers. [ADRS/0001-native-source.md](ADRS/0001-native-source.md) records the approved source approach.

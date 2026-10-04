# D_AI Harness delta reference

## Source lineage

The checkout preserves the official DeepSeek Harness source history and attribution. The `upstream` remote points to `deepseek-ai/deepseek-harness`; `origin` points to the owner's private D_AI repository. The complete upstream source ancestry has been imported into the independent private D_AI repository; the integrator verified matching upstream source tree hashes. GitHub fork metadata has not been established. Upstream is retained only for optional manual inspection. No automatic upstream import or update workflow remains enabled; private-repository CI is a separate configuration concern. Original upstream workflow files are retained as inert copies under `.github/upstream-workflows/`; they cannot run automatically.

The integrator records the exact upstream and published revisions in [TEST_REPORT.md](TEST_REPORT.md). Original license files remain authoritative for upstream code and native components.

## Runtime build changes

The root build and native-addon build use Node with the tsx ESM import hook. This avoids the tsx CLI's IPC requirement while preserving `dsh` as the application launcher. The native build accepts an optional `NODE_HEADERS_DIR`; an explicit value must identify a directory containing `node_api.h`. Without the override, the build keeps the original Node-installation-relative header location. This is a build-time option, not a runtime native-binary override.

## Client changes

The native D_AI locale package introduces Arabic common/language-setting dictionaries and bidi styling. Other namespaces retain English fallback. Full Arabic coverage, shell RTL interaction and browser accessibility verification remain incomplete. The package creates no parallel user-language store and contributes no model instructions.

## Core modification policy

No D_AI alteration to the agent loop is recorded here. Domain behavior should use existing native extension points. A necessary loop or permission change requires an owner-reviewed material design decision and updates to the upstream architecture reference and affected consumers. [ADRS/0001-native-source.md](ADRS/0001-native-source.md) records the approved source approach.

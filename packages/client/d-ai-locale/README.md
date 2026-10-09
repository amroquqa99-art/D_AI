# D_AI Arabic and bidi foundation

Native Harness client plugin. Register `@deepseek-ai/dsh-client-d-ai-locale` under the D_AI web profile's `dsh.client` group and declare the package in its resolver manifest. Add the package project to `tsconfig.client.json`.

The Settings language selector gains العربية. Selection persists through the existing native locale settings service; the plugin does not store a parallel preference. The native service synchronizes `html.lang`; this plugin follows its snapshot to synchronize `html.dir` and disposes its contributions on unload.

## Translation coverage

Complete Arabic dictionaries: `common` and `settings.locale`. All other upstream namespaces still fall back to English. This package is a foundation, not complete Arabic coverage or verified full-shell RTL navigation. English and Chinese retain their existing dictionaries.

Code/preformatted blocks, MathML/KaTeX and URL/email/number inputs use isolated LTR layout in Arabic. Evidence URLs, IDs and numeric values rendered by D_AI components should use `data-d-ai-bidi="ltr"`; prose can use `<bdi dir="auto">`. No string or stored source content is changed. Existing physical left/right shell geometry, resizing interactions, keyboard direction and accessibility need browser QA and a later logical-CSS migration; a global visual mirror is not applied.

## Model Experience

None. This package adds no model instructions, tools or state.

## Checks

Focused native-locale composition specs live in `tests/locale.client.spec.ts`. They use a fixture Host settings transport, not a running application. A real Loader/web composition and browser RTL check remain integration requirements.
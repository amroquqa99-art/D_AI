---
description: "Arabic dictionaries and reversible bidirectional layout support for the D_AI web profile, for users and client-package maintainers."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-d-ai-locale

## Summary

This native Harness client plugin adds Arabic to the existing language selector and supplies reversible RTL behavior for the D_AI web profile. It uses the native locale settings service instead of creating another preference store, keeps code, URLs, numbers, and mathematics isolated as LTR content, and contributes no model instructions or tools. The current dictionaries cover `common` and `settings.locale`; the rest of the shell continues to use its English fallback.

## Table of Contents

- [Use this package](#use-this-package)
- [Translation coverage](#translation-coverage)
- [Bidirectional behavior](#bidirectional-behavior)
- [Verification](#verification)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Register `@deepseek-ai/dsh-client-d-ai-locale` under the D_AI web profile's client group and declare the package in the resolver manifest. The language selector then exposes العربية. Selection persists through the existing locale settings service; the plugin follows the native service snapshot to synchronize `html.dir` and disposes its contributions when unloaded.

<a id="translation-coverage"></a>
## Translation coverage

The package provides complete Arabic dictionaries for `common` and `settings.locale`. Other upstream namespaces fall back to English. English and Chinese retain their existing dictionaries.

<a id="bidirectional-behavior"></a>
## Bidirectional behavior

Code and preformatted blocks, MathML and KaTeX, and URL, email, and number inputs use isolated LTR layout when Arabic is active. D_AI components should mark evidence URLs, identifiers, and numeric values with `data-d-ai-bidi="ltr"`; prose can use `<bdi dir="auto">`. The plugin changes presentation only and never rewrites a string or stored source record.

<a id="verification"></a>
## Verification

Focused native-locale composition tests live in `tests/locale.client.spec.ts`. They use a fixture Host settings transport and verify registration, reversible direction changes, LTR isolation, and cleanup. The D_AI M1 checkpoint separately records a built web-profile boot.

<a id="model-experience"></a>
## Model Experience

None, as this package changes browser localization and bidirectional presentation without contributing model context.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Dictionary coverage is incomplete** — namespaces outside `common` and `settings.locale` still fall back to English.
- **Full-shell RTL acceptance is pending** — physical left/right geometry, resize interactions, keyboard direction, and browser accessibility still need a logical-CSS migration and browser QA.
- **The test transport is a fixture** — the focused test does not prove a live browser or Host settings transport.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

Keep the package on the native locale service and preserve reversible direction changes. Do not add a parallel language preference or alter stored evidence text to obtain visual RTL behavior.

</details>

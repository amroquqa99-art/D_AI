# ADR 0001: Native Harness source foundation

## Decision

The owner-approved foundation is the actual official DeepSeek Harness source, extended within its Cordis packages, bundles, profiles, agent runtime and sessions. Preserve original source ancestry, attribution and an upstream remote. The owner's independent private D_AI repository contains the imported working source and original ancestry. Source derivation does not itself create GitHub fork metadata. The owner explicitly excludes automatic upstream updates; retaining an upstream remote permits optional manual audits only.

## Alternatives

An external orchestration wrapper would duplicate lifecycle and persistence and would fail the approved native-component requirement. Reimplementing the entire Harness would discard its existing runtime and require independent verification of every replacement. Native package extensions reuse the current supported mechanisms and reserve core changes for demonstrated needs.

## Consequences

Application launch remains through `dsh` profiles. Registrations unwind through Cordis effects. Required domain state uses native events/projections and persistence catalogs. Provider/model execution remains real and independently attributable. Material changes to architecture, access, autonomy or scope require owner review before adoption.

## Verification

The integrator verified the complete source import and matching upstream source tree hashes. The integrator owns build/start evidence, runtime integration and independent review. [HARNESS_DELTA.md](../HARNESS_DELTA.md) identifies current modifications; [TEST_REPORT.md](../TEST_REPORT.md) supplies actual execution evidence. This decision does not mark any domain or live model integration as completed.

# D_AI Free-only Model Routing (experimental)

## Scope

OpenCode Desktop already ships the native OpenCode Console integration and
model picker. D_AI Desktop preserves that implementation in its upstream fork.
Connecting to Console **in D_AI Desktop** uses a separate userData/CLI profile:
credentials from a separate OpenCode installation are not imported or copied.
A paid OpenCode Zen/Go subscription is **not** a prerequisite for a model
listed as free, but a Console sign-in may be needed to populate the catalog.

**Provider eligibility caveat:** OpenCode's published Console model documentation
restricts its free-tier chat models to OpenCode clients. A separately branded
derivative can be refused by the remote provider (including HTTP 403). This
project must never spoof the original client, fabricate a session identity,
strip origin checks or bypass provider policy to obtain free access.
Actual availability requires testing a user-authorized request from the
running D_AI Desktop binary. Some official clients have also reported 403s;
a catalog entry alone is not sufficient evidence of eligibility.

Documentation:
- https://opencode.ai/v2/docs/models
- https://dev.opencode.ai/v2/docs/console/models

## D_AI model registry policy

The D_AI model registry now accepts an explicit `free_only` route parameter.
The native D_AI MCP `dai_model_route` defaults to `free_only=True`.
The general registry retains `free_only=False` for backwards compatibility
with explicit opt-in/manual use. No existing OpenCode chat/session UI is
modified by this switch.

A free-only candidate requires **all** of:

- A model registered under `opencode` or `opencode-go`.
- An owner-supplied record marked `measured`, with **both** known zero
  input and zero output prices. Name suffixes (including `-free`) do not count.
- An `available` or `limited` state and the required capabilities.

Paid input, paid output, estimated or unknown cost, unavailable candidates,
unknown providers or missing prices **cannot** trigger an automatic paid
fallback. The router returns `model=None` and `needs_decision=True`
when none qualifies.

### Important limits

This is a **candidate selection guard**, not a spending authorization or a
live provider tariff verification. The current ModelRegistry schema does not
track all possible non-token charges, cache-write rates or billing rules.
Zero listed input/output prices do not guarantee an invoice cannot occur.
For autonomous execution, a later enforcement boundary must refresh the
provider's actual prices/capabilities immediately before the request,
enforce explicit human approvals for anything billable, and meter receipts.

The read-only Desktop mission bridge does **not** invoke models. Future
execution must use the host's established OpenCode account selection and
permission engine, not a fabricated direct provider token.

## Acceptance tests

`python -m unittest discover -s tests -p test_free_model_routing.py -v`

- Free-only route selects only measured zero-input/zero-output OpenCode models.
- Zero-input / nonzero-output, unknown costs and misleading names fail closed.
- Unavailable models and missing capabilities fail closed.
- Non-Boolean `free_only` is rejected.
- Manual paid-compatible route remains a distinct explicit mode.

Do not claim end-to-end free model access without a successful authenticated
model response in the real (non-impersonating) D_AI Desktop application.

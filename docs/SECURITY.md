# D_AI security reference

## Current trust model

The present target is a local single-owner application. The upstream Harness owns current authentication, credential, sandbox and approval behavior. D_AI must retain those controls; institutional tenancy, role administration and attribute-based policy remain acceptance requirements rather than completed controls. Consult [PRODUCT_SPEC.md](PRODUCT_SPEC.md) for binding domain restrictions.

## Policy requirements

Retrieved pages, documents and tool output are untrusted evidence. They cannot grant permissions, change owner policy or authorize tool execution. Scoped tools and runtime checks must enforce access independently of model instructions and hidden UI controls. Source injection and cross-system grant enforcement require dedicated integration tests before acceptance.

The owner can configure complete tool capabilities for every system from the intended control panel. A system name does not impose an immutable capability restriction. Cross-system evidence/tool use is governed by attributable owner grants, including broad owner grants and temporary or permanent institutional grants naming the originating system, tool, actor, source and applicable policy. Sending classified material to a cloud provider requires an explicit classification/upload decision. Provider credentials belong in approved local stores or environment configuration, never source control or reports.

Sensitive external effects require owner approval and idempotency safeguards. Finance has no approved automatic capital execution. Active cybersecurity testing requires explicit authorization scope and an isolated target; unauthorized intrusion, credential theft, audit evasion and covert persistence remain prohibited. Investigation does not authorize covert profiling, mass surveillance or weapon targeting.

## Durability and operational security

Persistent evidence must retain original observations and refuted alternatives. A scheduler must fence expired workers and prevent retries from duplicating committed external effects. Recovery tests must cover interrupted work, budget exhaustion and network loss. These D_AI protections are not yet demonstrated as a complete system.

Keep local services bound to the documented local configuration unless deployment has an independent access-control review. Private-repository visibility does not replace credential scanning or dependency review. Backups may contain credentials and private source data; restrict access and validate restores before relying on them.

## Verification ownership

The integrator and independent security reviewer own runtime enforcement tests, injected-source negative tests, authorization checks, secret handling and audit review. [FEATURE_MATRIX.md](FEATURE_MATRIX.md) distinguishes inherited controls from D_AI additions; [TEST_REPORT.md](TEST_REPORT.md) records tests actually executed.

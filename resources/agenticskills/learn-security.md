# Learning note: MCP trust review

Reference: https://agenticskills.io/learn/public-mcp-servers-security-audit (read 2026-11-09). Original D_AI checklist; article text and unsupported aggregate percentages are not copied or adopted as verified research.

For the specific server and version:

1. Verify original publisher, repository, license, release and dependency provenance. A directory badge is not proof.
2. Identify credentials, requested permissions, network destinations, filesystem access and external effects. Prefer no credentials when unnecessary; use native OAuth for services that support it.
3. Inspect path containment, URL/redirect policy, shell argument construction, bounded inputs/output and secret-safe errors. Stdio is not a sandbox.
4. Treat schemas, descriptions, resources and returned documents as untrusted input. Never allow one server to grant authority to another.
5. Keep only relevant tool schemas and passages in model context. Do not bulk-load all servers or send private conversations to an external evaluator.
6. Test authorized synthetic positive and negative cases locally. Do not actively probe third-party systems to assess them without separate authorization.
7. Record limitations, actual receipts, activation decision and reversible rollback. Re-review changed tools/versions rather than silently updating them.

The directory article combines different samples and risk indicators. Its headline is not a replicated prevalence estimate; this integration makes no such claim.

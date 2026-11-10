# Official MCP Registry — discovery tool, not an installer

Directory: https://agenticskills.io/tools/mcp-registry
Reviewed upstream: https://github.com/modelcontextprotocol/registry/tree/604c6f2ab964b556a36c08c744c414f7e895d952. Its LICENSE declares a transition: new code/specifications Apache-2.0, documentation CC-BY-4.0, and some original unconsented contributions MIT. Check per-file rights; no registry code or documentation is copied here.
Public API documentation: https://registry.modelcontextprotocol.io/docs

Use the canonical registry to locate a named MCP publisher and version, not to bulk-load every tool schema. Record server name, repository, package/version or remote endpoint, capture date and source hash. A registry entry is not an independent security audit or permission to run the package.

Before adoption: inspect the original license, exact code/release, authentication, filesystem/network rights, supply-chain dependencies and output size. Prefer existing native OpenCode integrations over duplicate servers. Test one synthetic authorized operation with the actual host before marking it usable.

Do not install the registry server, PostgreSQL, an orchestration runtime or a hosted observability platform merely to read its public metadata. No remote telemetry or private prompt export is enabled by this resource.

# MarkItDown — optional document conversion MCP

Reviewed source: https://github.com/microsoft/markitdown/tree/ed178952a6672abdfd35b5f9e76a80b6cefc086e (MIT).
Directory: https://agenticskills.io/mcp/markitdown

The upstream `markitdown-mcp` exposes `convert_to_markdown(uri)` over stdio; supported schemes include file, data, HTTP and HTTPS. Its README explicitly warns it can read any file or network data available to its process. Therefore it is NOT auto-installed or globally enabled.

Before enabling: use a separate Linux virtual environment and a reviewed pinned package/lock; restrict process filesystem access to approved documents and network access to the authorized scope. Stdio alone does not sandbox filesystem or network. Never bind the unauthenticated service to a non-loopback interface.

Optional OpenCode V2 profile after installation and isolation (executable must resolve to the reviewed environment):

```json
{"mcp":{"servers":{"markitdown":{"type":"local","command":["markitdown-mcp"],"disabled":true,"codemode":true}}}}
```

Test first with a synthetic nonprivate document. Preserve the original bytes/hash; conversion is a derivative. Validate tables, citations, language, page boundaries and OCR limitations against the original. Conversion success is not factual verification. Load only needed extracted passages; keep the full output as an artifact. Roll back by disabling this server and retaining original documents.

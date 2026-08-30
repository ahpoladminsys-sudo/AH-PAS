---
name: API server native tests
description: Why API server tests use a bundling harness before Node's native test runner
---

API server tests that import source TypeScript should be bundled with esbuild before running under Node's native test runner; keep CommonJS runtime packages external.

**Why:** The workspace source uses extensionless TypeScript imports that Node cannot resolve directly, while bundling CommonJS packages such as Express can produce unsupported dynamic `require` calls for built-in modules.

**How to apply:** Add a focused test build entry when testing API source directly. Externalize packages whose CommonJS loading behavior should remain under Node, especially the connector SDK and Express.

When a browser-fetch shim calls the Node test server, preserve an existing `Content-Type` header rather than adding a second casing of the same header.

**Why:** Node can serialize duplicate `Content-Type` values as a comma-separated header, causing Express JSON parsing to skip the request body and producing misleading validation failures.

**How to apply:** Add test-only auth headers without merging a lowercase default when the browser request already supplies `Content-Type`.
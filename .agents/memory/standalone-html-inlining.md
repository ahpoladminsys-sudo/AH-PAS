---
name: Standalone HTML inlining
description: Prevents JavaScript corruption while embedding local modules into the one-file workspace build.
---

Use function callbacks, not replacement strings, when a build transform inserts arbitrary CSS, JavaScript, JSON, or workbook content into HTML. For this Vite setup, perform final inlining and non-HTML asset pruning in a post-ordered `generateBundle` hook rather than relying only on `transformIndexHtml`.

**Why:** JavaScript `String.replace` interprets dollar-sign sequences in replacement strings. Valid application markup containing a dollar sign followed by a quote was silently expanded with the unmatched HTML suffix, producing a browser-only script parse error even though the source module passed syntax checks. Vite's HTML transform can also run before the final output bundle is available, so asset pruning there can leave a blank HTML shell or stale asset files.

**How to apply:** Any standalone-build inliner must return inserted content from a replacement callback. After building, extract every inline script from the generated HTML and run a JavaScript syntax check on each one; restart the managed workflow before trusting browser logs so they reflect the rebuilt document.
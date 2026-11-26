# Explicit CLI-owned highlighting

Transform 5 renders escaped code without implicitly loading Highlight.js. The CLI already owns the full implementation and its themes, so `core/markdown/highlighter.ts` imports the full package and creates one explicit structural adapter per application module. It does not restrict languages or introduce a user setting.

Both HTML-producing Transform boundaries supply this adapter: `Run.transform` through its strict core configuration and the Markdown changelog collector's direct Transform call. Content output, included documents and anchor rendering use Run. Raw MarkdownIt parsing in code collection and yfmlint remains diagnostic/token processing rather than an HTML highlighting boundary. Theme assets and the existing sanitization policy are unchanged.

The implementation is imported with relative paths because the build rewrites `~/core/*` to exported CLI lib entries; a private helper subpath is not a standalone packaged lib entry. Both application callers share the same bundled module.

Acceptance compares actual CLI content HTML byte-for-byte with the prior API4 candidate for JavaScript, TypeScript, YAML, shell prompts, line numbers, wrapping, copy controls and escaped unknown/plain source. Real binary tests also check full HTML output and the separate Markdown changelog JSON description. Full unit and existing content/include/options/translation/configuration/code E2E gates retain their snapshots. Exact candidate and runtime resolutions are recorded in the coordinated consumer evidence; registry release remains separate.

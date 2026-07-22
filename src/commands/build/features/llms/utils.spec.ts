import {describe, expect, it} from 'vitest';

import {stripHtmlTags} from './utils';

describe('stripHtmlTags', () => {
    describe('basic removal', () => {
        it.each([
            [
                'single-line <style>',
                'Text before\n<style>.x { color: red; }</style>\nText after',
                'Text before\n\nText after',
            ],
            [
                'multiline <style>',
                'Text before\n<style>\n  .x { color: red; }\n  .y { color: blue; }\n</style>\nText after',
                'Text before\n\nText after',
            ],
            [
                '<script> without attributes',
                'Text\n<script>console.log("hello");</script>\nMore text',
                'Text\n\nMore text',
            ],
            [
                '<script> with attributes',
                'Text\n<script type="text/javascript">console.log("hello");</script>\nMore text',
                'Text\n\nMore text',
            ],
            [
                'both <style> and <script>',
                '# Title\n<style>.x { color: red; }</style>\nSome text\n<script>alert(1);</script>\nMore text',
                '# Title\n\nSome text\n\nMore text',
            ],
        ])('removes %s', (_label, input, expected) => {
            expect(stripHtmlTags(input, ['style', 'script'])).toBe(expected);
        });

        it('removes multiple <style> blocks of the same type', () => {
            const input =
                '<style>.a { color: red; }</style>\nText\n<style>.b { color: blue; }</style>';
            const result = stripHtmlTags(input, ['style', 'script']);

            // Both <style> blocks removed, leading/trailing whitespace trimmed
            expect(result).toBe('Text');
        });

        it('preserves surrounding markdown content', () => {
            const input = [
                '# Heading',
                '',
                'Some **bold** text and [link](http://example.com).',
                '',
                '<style>.x { color: red; }</style>',
                '',
                '- List item 1',
                '- List item 2',
            ].join('\n');
            const result = stripHtmlTags(input, ['style', 'script']);

            expect(result).toBe(
                [
                    '# Heading',
                    '',
                    'Some **bold** text and [link](http://example.com).',
                    '',
                    '',
                    '',
                    '- List item 1',
                    '- List item 2',
                ].join('\n'),
            );
        });
    });

    describe('inline and indented tags', () => {
        it.each([
            [
                '<style> inline with text',
                'Some text <style>.x { color: red; }</style> more text',
                'Some text  more text',
            ],
            [
                '<script> inline with text',
                'Before <script>console.log(1);</script> After',
                'Before  After',
            ],
            [
                '<style> with 2-space indentation',
                '  <style>\n  .x {\n   color: red;\n   }\n  </style>\nText',
                'Text',
            ],
            [
                '<style> with 3-space indentation',
                '   <style>\n   .x { color: red; }\n   </style>\nText',
                'Text',
            ],
        ])('removes %s', (_label, input, expected) => {
            expect(stripHtmlTags(input, ['style', 'script'])).toBe(expected);
        });

        it('removes <style> inside a list item (with indentation)', () => {
            const input = [
                '- List item 1',
                '  <style>',
                '  .x { color: red; }',
                '  </style>',
                '- List item 2',
            ].join('\n');
            const result = stripHtmlTags(input, ['style', 'script']);

            expect(result).toBe('- List item 1\n  \n- List item 2');
        });

        it('removes <style> inside a nested list item', () => {
            const input = [
                '- Level 1',
                '  - Level 2',
                '    <style>.x { color: red; }</style>',
                '    Text in level 2',
            ].join('\n');
            const result = stripHtmlTags(input, ['style', 'script']);

            expect(result).toBe('- Level 1\n  - Level 2\n    \n    Text in level 2');
        });

        it('removes <style> inside a blockquote', () => {
            const input = [
                '> Quote text',
                '> <style>.x { color: red; }</style>',
                '> More quote',
            ].join('\n');
            const result = stripHtmlTags(input, ['style', 'script']);

            expect(result).toBe('> Quote text\n> \n> More quote');
        });
    });

    describe('edge cases', () => {
        it('returns empty string for empty input', () => {
            expect(stripHtmlTags('', ['style', 'script'])).toBe('');
        });

        it('returns content unchanged when no tags are present', () => {
            const input = '# Title\n\nSome text without any HTML tags.';
            expect(stripHtmlTags(input, ['style', 'script'])).toBe(input);
        });

        it('returns content unchanged when tags list is empty', () => {
            const input = '<style>.x { color: red; }</style>';
            expect(stripHtmlTags(input, [])).toBe(input);
        });

        it('does not remove tags without a closing tag', () => {
            const input = 'Text\n<style>.x { color: red; }\nMore text';
            const result = stripHtmlTags(input, ['style', 'script']);

            // No closing </style> — regex won't match, content preserved
            expect(result).toBe(input);
        });

        it('handles case-insensitive tag names', () => {
            const input = 'Text\n<STYLE>.x { color: red; }</STYLE>\nMore text';
            const result = stripHtmlTags(input, ['style', 'script']);

            expect(result).toBe('Text\n\nMore text');
        });
    });

    describe('code block protection', () => {
        it('does NOT remove <style> inside fence code blocks (```)', () => {
            const input = [
                'Text before',
                '',
                '```html',
                '<style>.x { color: red; }</style>',
                '```',
                '',
                'Text after',
            ].join('\n');
            const result = stripHtmlTags(input, ['style', 'script']);

            // The <style> inside the code block must be preserved
            expect(result).toContain('<style>.x { color: red; }</style>');
            expect(result).toBe(input);
        });

        it('does NOT remove <script> inside fence code blocks (```)', () => {
            const input = [
                'Text before',
                '',
                '```javascript',
                '<script type="text/javascript">console.log("hello");</script>',
                '```',
                '',
                'Text after',
            ].join('\n');
            const result = stripHtmlTags(input, ['style', 'script']);

            expect(result).toContain(
                '<script type="text/javascript">console.log("hello");</script>',
            );
            expect(result).toBe(input);
        });

        it('does NOT remove <style>/<script> inside tilde fence code blocks (~~~)', () => {
            const input = [
                'Text before',
                '',
                '~~~html',
                '<style>.x { color: red; }</style>',
                '<script>alert(1);</script>',
                '~~~',
                '',
                'Text after',
            ].join('\n');
            const result = stripHtmlTags(input, ['style', 'script']);

            expect(result).toContain('<style>.x { color: red; }</style>');
            expect(result).toContain('<script>alert(1);</script>');
            expect(result).toBe(input);
        });

        it('removes <style> outside code blocks but preserves inside', () => {
            const input = [
                '<style>.real { color: red; }</style>',
                '',
                '```html',
                '<style>.example { color: blue; }</style>',
                '```',
            ].join('\n');
            const result = stripHtmlTags(input, ['style', 'script']);

            // The real <style> is removed, the example inside code block is preserved
            expect(result).not.toContain('.real { color: red; }');
            expect(result).toContain('.example { color: blue; }');
        });

        it('removes <style> inside 4-space indented code blocks (known limitation)', () => {
            // 4-space indented code blocks are NOT protected — this is a
            // known limitation accepted for simplicity (see ADR-009).
            const input = [
                'Text before',
                '',
                '    <style>.x { color: red; }</style>',
                '    <script>alert(1);</script>',
                '',
                'Text after',
            ].join('\n');
            const result = stripHtmlTags(input, ['style', 'script']);

            // Tags inside indented code blocks ARE removed (known limitation)
            expect(result).not.toContain('<style>.x { color: red; }</style>');
            expect(result).not.toContain('<script>alert(1);</script>');
        });

        it('handles nested code blocks (code block inside code block)', () => {
            const input = [
                '````',
                '```html',
                '<style>.x { color: red; }</style>',
                '```',
                '````',
            ].join('\n');
            const result = stripHtmlTags(input, ['style', 'script']);

            // The inner code block is part of the outer code block — preserved
            expect(result).toContain('<style>.x { color: red; }</style>');
        });
    });

    describe('include file scenario', () => {
        it('removes <style>/<script> that came from a merged include file', () => {
            // Simulates the result after merge-includes: an include file
            // containing only <style> and <script> is merged into the parent.
            // The merged content looks like this:
            const mergedContent = [
                '# Parent Title',
                '',
                'Some parent text.',
                '',
                '<style>',
                '.button {',
                '  background: blue;',
                '  color: white;',
                '}',
                '</style>',
                '',
                '<script>',
                'function init() {',
                '  console.log("initialized");',
                '}',
                '</script>',
                '',
                'More parent text.',
            ].join('\n');
            const result = stripHtmlTags(mergedContent, ['style', 'script']);

            expect(result).not.toContain('<style>');
            expect(result).not.toContain('.button {');
            expect(result).not.toContain('<script>');
            expect(result).not.toContain('function init()');
            expect(result).toContain('# Parent Title');
            expect(result).toContain('Some parent text.');
            expect(result).toContain('More parent text.');
        });

        it('removes <style> from include that has nothing else', () => {
            // An include file that contains ONLY a <style> block
            const includeOnlyStyle = '<style>\n  .highlight { background: yellow; }\n</style>';
            const result = stripHtmlTags(includeOnlyStyle, ['style', 'script']);

            expect(result).toBe('');
        });

        it('removes <script> from include that has nothing else', () => {
            // An include file that contains ONLY a <script> block
            const includeOnlyScript =
                '<script type="text/javascript">\n  console.log("loaded");\n</script>';
            const result = stripHtmlTags(includeOnlyScript, ['style', 'script']);

            expect(result).toBe('');
        });
    });

    describe('real-world examples', () => {
        it('preserves <style> and <script> inside a Go code block within {% cut %}', () => {
            // Real-world example: Go source code with embedded HTML containing
            // <style> and <script> tags, shown inside a fenced code block
            // within a {% cut %} directive.
            const input = [
                "Test your web application. To do this, on your local computer, paste the `alb-back-0` server's public IP address into the browser's address bar.",
                '',
                "Your browser will open a page with the host name and information about the web server's running time since startup.",
                '',
                '{% cut "Web application source code" %}',
                '',
                '```go',
                'package main',
                '',
                'import (',
                '  "context"',
                '  "fmt"',
                '  "net/http"',
                ')',
                '',
                'const htmlTemplate = `',
                '<!DOCTYPE html>',
                '<html lang="en">',
                '<head>',
                '    <style>*{margin:0;padding:0;box-sizing:border-box}body{min-height:100vh}</style>',
                '    <meta name="viewport" content="width=device-width,initial-scale=1">',
                '    <title>Server Info & Time</title>',
                '</head>',
                '<body>',
                '    <div class="container">',
                '        <div class="server-name">Server Hostname: %s</div>',
                '    </div>',
                '    <script>',
                '        const e=()=>{const e=new Date;document.getElementById("datetime").textContent=e.toLocaleTimeString()};',
                '    </script>',
                '</body>',
                '</html>`',
                ')',
                '',
                'func main() {',
                '  mux := http.NewServeMux()',
                '  mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {',
                '    w.Write(htmlContent)',
                '  })',
                '}',
                '```',
                '',
                '{% endcut %}',
            ].join('\n');
            const result = stripHtmlTags(input, ['style', 'script']);

            // The <style> and <script> inside the Go code block must be preserved
            expect(result).toContain(
                '<style>*{margin:0;padding:0;box-sizing:border-box}body{min-height:100vh}</style>',
            );
            expect(result).toContain('<script>');
            expect(result).toContain(
                'const e=()=>{const e=new Date;document.getElementById("datetime")',
            );
            // The code block structure must be intact
            expect(result).toContain('```go');
            expect(result).toContain('package main');
            expect(result).toContain('{% cut "Web application source code" %}');
            expect(result).toContain('{% endcut %}');
        });
    });
});

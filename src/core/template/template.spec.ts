import {describe, expect, it} from 'vitest';

import {Template} from './template';

describe('Template', () => {
    describe('setCspDisabled', () => {
        it('should not include CSP meta tag when disabled', () => {
            const template = new Template('index.html' as RelativePath, 'en');
            template.setCspDisabled(true);
            template.addCsp({'script-src': ["'self'"]});

            const html = template.dump();

            expect(html).not.toContain('Content-Security-Policy');
        });

        it('should include CSP meta tag when not disabled', () => {
            const template = new Template('index.html' as RelativePath, 'en');
            template.addCsp({'script-src': ["'self'"]});

            const html = template.dump();

            expect(html).toContain('Content-Security-Policy');
            expect(html).toContain("script-src 'self'");
        });

        it('should ignore all addCsp calls when disabled', () => {
            const template = new Template('index.html' as RelativePath, 'en');
            template.setCspDisabled(true);
            template.addCsp({'script-src': ["'self'"]});
            template.addCsp({'style-src': ["'unsafe-inline'"]});
            template.addCsp({'connect-src': ['https://example.com']});

            const html = template.dump();

            expect(html).not.toContain('Content-Security-Policy');
            expect(html).not.toContain('script-src');
            expect(html).not.toContain('style-src');
            expect(html).not.toContain('connect-src');
        });

        it('should ignore addCsp calls made before and after setCspDisabled', () => {
            const template = new Template('index.html' as RelativePath, 'en');
            template.addCsp({'script-src': ['https://before.com']});
            template.setCspDisabled(true);
            template.addCsp({'style-src': ['https://after.com']});

            const html = template.dump();

            // CSP should still contain the rule added before disabling
            expect(html).toContain('Content-Security-Policy');
            expect(html).toContain('https://before.com');
            expect(html).not.toContain('https://after.com');
        });

        it('should re-enable CSP when set back to false', () => {
            const template = new Template('index.html' as RelativePath, 'en');
            template.setCspDisabled(true);
            template.addCsp({'script-src': ['https://ignored.com']});
            template.setCspDisabled(false);
            template.addCsp({'style-src': ['https://accepted.com']});

            const html = template.dump();

            expect(html).toContain('Content-Security-Policy');
            expect(html).not.toContain('https://ignored.com');
            expect(html).toContain('https://accepted.com');
        });

        it('should return template instance for chaining', () => {
            const template = new Template('index.html' as RelativePath, 'en');
            const result = template.setCspDisabled(true);

            expect(result).toBe(template);
        });

        it('should not affect other template features when CSP is disabled', () => {
            const template = new Template('index.html' as RelativePath, 'en');
            template.setCspDisabled(true);
            template.setTitle('Test Page');
            template.addBody('<div>content</div>');
            template.addScript('/app.js');
            template.addStyle('/app.css');

            const html = template.dump();

            expect(html).toContain('Test Page');
            expect(html).toContain('<div>content</div>');
            expect(html).toContain('/app.js');
            expect(html).toContain('/app.css');
            expect(html).not.toContain('Content-Security-Policy');
        });
    });

    describe('dump body interpolation', () => {
        it('should render default root container when body is empty', () => {
            const template = new Template('index.html' as RelativePath, 'en');

            const html = template.dump();

            expect(html).toContain('<div id="root"></div>');
        });

        // Regression: https://github.com/diplodoc-platform/cli/issues/1893
        // ts-dedent must not re-indent whitespace-significant body content.
        it('should preserve whitespace in multi-line <pre><code> body', () => {
            const code = [
                '<pre><code class="hljs bash"># 1. comment',
                './init.sh --dump-postgres',
                '',
                './init.sh --pg-sql',
                '</code></pre>',
            ].join('\n');
            const template = new Template('index.html' as RelativePath, 'en');
            template.addBody(code);

            const html = template.dump();

            // body lines must keep their original (zero) indentation
            expect(html).toContain(code);
            // no extra leading indentation injected on subsequent lines
            expect(html).not.toMatch(/\n {2,}\.\/init\.sh --dump-postgres/);
        });

        it('should not re-indent lines of a multi-line body', () => {
            const body = 'first\nsecond\nthird';
            const template = new Template('index.html' as RelativePath, 'en');
            template.addBody(body);

            const html = template.dump();

            expect(html).toContain('first\nsecond\nthird');
        });

        // The replacement must use a replacer function so the special patterns
        // ($$, $&, $`, $', $n) of String.prototype.replace are NOT interpreted.
        it('should insert body verbatim when it contains $-replacement patterns', () => {
            const body = "<p>$$ and $& and $` and $' and $1 and $<name></p>";
            const template = new Template('index.html' as RelativePath, 'en');
            template.addBody(body);

            const html = template.dump();

            expect(html).toContain(body);
            expect(html).toContain('$$ and $& and');
        });

        it('should concatenate multiple body fragments with newlines', () => {
            const template = new Template('index.html' as RelativePath, 'en');
            template.addBody('<div>one</div>');
            template.addBody('<div>two</div>');

            const html = template.dump();

            expect(html).toContain('<div>one</div>\n<div>two</div>');
        });
    });
});

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
});

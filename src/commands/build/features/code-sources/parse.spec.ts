import {describe, expect, it} from 'vitest';

import {parseDirectives} from './parse';

describe('parseDirectives', () => {
    it('should parse a whole file reference', () => {
        const [item] = parseDirectives('{% include-code [Connect](go-sdk:examples/connect.go) %}');

        expect(item.error).toBe(null);
        expect(item.directive).toMatchObject({
            caption: 'Connect',
            source: 'go-sdk',
            path: 'examples/connect.go',
            fragment: null,
            dedent: true,
            link: true,
        });
    });

    it('should parse a region reference', () => {
        const [item] = parseDirectives('{% include-code [](go-sdk:examples/connect.go#connect) %}');

        expect(item.directive?.fragment).toEqual({type: 'region', name: 'connect'});
    });

    it('should parse a line range', () => {
        const [item] = parseDirectives('{% include-code [](go-sdk:a.go#L10-L25) %}');

        expect(item.directive?.fragment).toEqual({type: 'lines', start: 10, end: 25});
    });

    it('should parse a single line', () => {
        const [item] = parseDirectives('{% include-code [](go-sdk:a.go#L7) %}');

        expect(item.directive?.fragment).toEqual({type: 'lines', start: 7, end: 7});
    });

    it('should parse attributes', () => {
        const [item] = parseDirectives(
            '{% include-code [](go-sdk:a.txt) lang="go" dedent=false link=no %}',
        );

        expect(item.directive).toMatchObject({lang: 'go', dedent: false, link: false});
    });

    it('should report position of the whole directive', () => {
        const content = 'before\n{% include-code [](go-sdk:a.go) %}\nafter';
        const [item] = parseDirectives(content);

        expect(content.slice(...item.location)).toBe('{% include-code [](go-sdk:a.go) %}');
    });

    it('should find several directives', () => {
        const items = parseDirectives(
            '{% include-code [](a:one.go) %}\ntext\n{% include-code [](b:two.go) %}',
        );

        expect(items).toHaveLength(2);
        expect(items.map((item) => item.directive?.source)).toEqual(['a', 'b']);
    });

    it('should reject a target without a source', () => {
        const [item] = parseDirectives('{% include-code [](examples/connect.go) %}');

        expect(item.directive).toBe(null);
        expect(item.error).toContain('invalid target');
    });

    it('should reject path traversal', () => {
        const [item] = parseDirectives('{% include-code [](go-sdk:../../etc/passwd) %}');

        expect(item.directive).toBe(null);
        expect(item.error).toContain('must not escape');
    });

    it('should reject a reversed line range', () => {
        const [item] = parseDirectives('{% include-code [](go-sdk:a.go#L25-L10) %}');

        expect(item.error).toContain('invalid line range');
    });

    it('should keep one broken directive from hiding the others', () => {
        const items = parseDirectives(
            '{% include-code [](broken) %}\n{% include-code [](go-sdk:a.go) %}',
        );

        expect(items[0].error).toBeTruthy();
        expect(items[1].directive?.path).toBe('a.go');
    });

    it('should not scan content without directives', () => {
        expect(parseDirectives('# Title\n\nplain text')).toEqual([]);
    });

    describe('directives shown as code examples', () => {
        it('should ignore a directive inside a fenced block', () => {
            const content = ['Usage:', '', '```', '{% include-code [](a:b.go) %}', '```'].join(
                '\n',
            );

            expect(parseDirectives(content)).toEqual([]);
        });

        it('should ignore a directive inside a fence with an info string', () => {
            const content = ['```markdown', '{% include-code [](a:b.go) %}', '```'].join('\n');

            expect(parseDirectives(content)).toEqual([]);
        });

        it('should ignore a directive inside an inline code span', () => {
            expect(parseDirectives('Inline: `{% include-code [](a:b.go) %}`')).toEqual([]);
        });

        it('should still resolve a directive after a closed fence', () => {
            const content = [
                '```',
                '{% include-code [](a:shown.go) %}',
                '```',
                '',
                '{% include-code [](a:real.go) %}',
            ].join('\n');

            const items = parseDirectives(content);

            expect(items).toHaveLength(1);
            expect(items[0].directive?.path).toBe('real.go');
        });
    });
});

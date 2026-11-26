import {describe, expect, it} from 'vitest';
import {getLogger} from '@diplodoc/transform/log';

import {MarkdownItConstructor} from '~/core/markdown/parser';
import {normalizePath} from '~/core/utils';

import includesDetect, {INCLUDE_REGEXP} from './includes-detect';
import includes from './includes';

const marker = '{% include [part](part.md) %}';
const options = {
    lang: 'en' as const,
    root: '',
    rootPublicPath: '',
    isLintRun: false,
    path: normalizePath('docs/main.md'),
    files: {
        'docs/part.md': 'Included body.',
        'docs/outer.md': '\u00a0{% include [part](part.md) %}\u00a0',
    },
    log: getLogger({error: () => {}, warn: () => {}, info: () => {}}),
};

const padding = ['', ' ', '\u00a0', '\ufeff', '\u2003', '\u202f', '\u3000', '\n', '\u00a0\n\u00a0'];
const cases = padding.flatMap((value) => [value + marker, marker + value, value + marker + value]);

function parser() {
    return new MarkdownItConstructor().use(includesDetect, options).use(includes, options);
}

describe('legacy include whitespace compatibility', () => {
    it.each(cases)('expands the whole paragraph %j', (source) => {
        expect(parser().render(source, {path: 'docs/main.md'})).toBe('<p>Included body.</p>\n');
    });

    it.each([
        `\t${marker}`,
        `    ${marker}`,
        `\u200b${marker}`,
        `${marker}\u200b`,
        `Before ${marker}`,
        `${marker} after`,
        `${marker}\nOther prose`,
        `~~~md\n\u00a0${marker}\n~~~`,
        `\`${marker}\``,
    ])('preserves protected or non-marker content %j', (source) => {
        const html = parser().render(source, {path: 'docs/main.md'});
        expect(html).not.toContain('Included body.');
        expect(html).toContain('include');
    });

    it('keeps source maps and nested relative include attribution', () => {
        const tokens = parser().parse('# Heading\n\n\u00a0{% include [outer](outer.md) %}\u00a0', {
            path: 'docs/main.md',
        });
        const body = tokens.find((token) => token.content === 'Included body.');
        expect(body).toMatchObject({
            map: [0, 1],
            sourceInfo: {
                sourceFile: 'docs/part.md',
                includeChain: [
                    {file: 'docs/main.md', line: 3},
                    {file: 'docs/outer.md', line: 1},
                ],
            },
        });
    });

    it('only changes the existing marker token, leaving its content and map coordinates intact', () => {
        const md = new MarkdownItConstructor().use(includesDetect, options);
        const source = `# Heading\n\n\u00a0${marker}\u00a0`;
        let observed: ReturnType<typeof md.parse> = [];
        md.core.ruler.before('includes_detect', 'observe_source', (state) => {
            observed = state.tokens.slice(-3);
        });
        const tokens = md.parse(source, {path: 'docs/main.md'});
        const token = tokens.find((item) => item.type === 'include');
        expect(token).toBe(observed[0]);
        expect(token?.map).toEqual([2, 3]);
        expect(token?.attrGet('path')).toBe('part.md');
        expect(observed[1].content).toBe(`\u00a0${marker}\u00a0`);
    });
});

it('preserves historical include captures across bounded whitespace and malformed variants', () => {
    const previous = /^{%\s*include\s*(notitle)?\s*\[(.+?)]\((.+?)\)\s*%}$/;
    const whitespace = ['', ' ', '\t', '\n', '\r\n', '\u00a0', '\u000b'];
    for (const before of whitespace) {
        for (const after of whitespace) {
            for (const tail of whitespace) {
                for (const keyword of ['', 'notitle', 'notitles', 'NOTITLE']) {
                    for (const body of [
                        '[part](part.md)',
                        '[part](part.md#chosen)',
                        '[](part.md)',
                        'x',
                    ]) {
                        const source =
                            '{%' + before + 'include' + after + keyword + tail + body + tail + '%}';
                        expect(INCLUDE_REGEXP.exec(source)?.slice()).toEqual(
                            previous.exec(source)?.slice(),
                        );
                    }
                }
            }
        }
    }
});

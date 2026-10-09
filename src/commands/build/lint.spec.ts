import type MarkdownIt from 'markdown-it';
import type {RawLintConfig} from '@diplodoc/yfmlint';

import {describe, expect, it, vi} from 'vitest';
import {LogLevels} from '@diplodoc/yfmlint';

import {lintWithLocalAnchors} from './lint';

const CONTENT = '[anchor](#missing)';

function markerPlugin(md: MarkdownIt) {
    md.core.ruler.push('test-link-markers', (state) => {
        for (const inline of state.tokens.filter((token) => token.type === 'inline')) {
            for (const link of inline.children || []) {
                if (link.type !== 'link_open') {
                    continue;
                }
                const rule = {
                    '#missing': 'YFM024',
                    '#legacy': 'YFM002',
                    '#unreachable': 'YFM003',
                }[link.attrGet('href') || ''];
                if (rule) {
                    link.attrSet(rule, 'test');
                }
            }
        }
    });
}

function lint(content = CONTENT, lintConfig: RawLintConfig = {}) {
    return lintWithLocalAnchors(content, 'index.md', {plugins: [markerPlugin], lintConfig});
}

describe('CLI local anchor diagnostics', () => {
    it('warns with YFM024 when the legacy rule is configured as an error', async () => {
        const diagnostics = await lint(CONTENT, {YFM002: LogLevels.ERROR});
        expect(diagnostics).toHaveLength(1);
        expect(diagnostics?.[0]).toMatchObject({
            level: LogLevels.WARN,
            lineNumber: 1,
            ruleNames: ['YFM024', 'missing-local-anchor'],
        });
        expect(String(diagnostics?.[0])).toBe(
            'index.md: 1: YFM024 / missing-local-anchor Local link anchor is missing in the target document [Context: "[anchor](#missing)"]',
        );
    });

    it('keeps a legacy error and a new warning on the same line', async () => {
        const diagnostics = await lint('[legacy](#legacy) [anchor](#missing)', {
            YFM002: LogLevels.ERROR,
        });
        expect(diagnostics?.map(({ruleNames, level}) => [ruleNames[0], level])).toEqual([
            ['YFM002', LogLevels.ERROR],
            ['YFM024', LogLevels.WARN],
        ]);
    });

    it('does not re-enable disabled legacy diagnostics', async () => {
        const diagnostics = await lint('[legacy](#legacy) [anchor](#missing)', {YFM002: false});
        expect(diagnostics?.map(({ruleNames}) => ruleNames[0])).toEqual(['YFM024']);
    });

    it.each([
        ['YFM024', LogLevels.ERROR, LogLevels.ERROR],
        ['YFM024', LogLevels.INFO, LogLevels.INFO],
        ['YFM024', {level: LogLevels.ERROR}, LogLevels.ERROR],
        ['YFM024', {loglevel: LogLevels.ERROR}, LogLevels.ERROR],
        ['missing-local-anchor', LogLevels.ERROR, LogLevels.ERROR],
    ] as const)('supports %s configured as %s', async (name, config, level) => {
        const diagnostics = await lint(CONTENT, {[name]: config});
        expect(diagnostics).toHaveLength(1);
        expect(diagnostics?.[0].level).toBe(level);
    });

    it.each([
        ['YFM024', false],
        ['YFM024', LogLevels.DISABLED],
        ['missing-local-anchor', false],
    ] as const)('supports disabling %s using %s', async (name, config) => {
        expect(await lint(CONTENT, {[name]: config})).toEqual([]);
    });

    it.each([
        ['<!-- markdownlint-disable YFM024 -->\n', 0],
        ['<!-- markdownlint-disable missing-local-anchor -->\n', 0],
        ['<!-- markdownlint-disable-file YFM024 -->\n', 0],
        ['<!-- markdownlint-disable-next-line YFM024 -->\n', 0],
        ['<!-- markdownlint-disable YFM002 -->\n', 1],
        ['<!-- markdownlint-disable no-header-found-for-link -->\n', 1],
        ['<!-- markdownlint-disable -->\n', 0],
        ['<!-- markdownlint-disable links -->\n', 0],
        ['<!-- markdownlint-disable YFM024 -->\n<!-- markdownlint-enable YFM024 -->\n', 1],
        ['<!-- markdownlint-configure-file {"YFM024":false} -->\n', 0],
    ])('honors inline directives: %s', async (prefix, expected) => {
        expect(await lint(prefix + CONTENT)).toHaveLength(expected);
    });

    it('honors disable-line and capture/restore without suppressing later diagnostics', async () => {
        const diagnostics = await lint(
            CONTENT +
                ' <!-- markdownlint-disable-line YFM024 -->\n\n' +
                '<!-- markdownlint-capture -->\n<!-- markdownlint-disable YFM024 -->\n' +
                CONTENT +
                '\n\n<!-- markdownlint-restore -->\n' +
                CONTENT,
        );
        expect(diagnostics).toHaveLength(1);
        expect(diagnostics?.[0].lineNumber).toBe(8);
    });

    it('does not rewrite rule names in the link context', async () => {
        const diagnostics = await lint('[YFM024 missing-local-anchor](#missing)');
        expect(diagnostics?.[0].errorContext).toBe('[YFM024 missing-local-anchor](#missing)');
    });

    it('leaves ordinary and unfinished HTML comments unchanged', async () => {
        const diagnostics = await lint(
            '<!-- YFM024 missing-local-anchor -->\n\n' +
                CONTENT +
                '\n\n<!-- markdownlint-disable YFM024',
        );
        expect(diagnostics).toHaveLength(1);
        expect(diagnostics?.[0].lineNumber).toBe(3);
        expect(diagnostics?.[0].errorContext).toBe(CONTENT);
    });

    it('preserves line numbers in multiline paragraphs', async () => {
        const diagnostics = await lint('Paragraph\n' + CONTENT);
        expect(diagnostics?.[0].lineNumber).toBe(2);
        expect(diagnostics?.[0].errorContext).toBe(CONTENT);
    });

    it('preserves include source metadata', async () => {
        const include = (md: MarkdownIt) => {
            md.core.ruler.push('test-include-metadata', (state) => {
                for (const token of state.tokens.filter((token) => token.type === 'inline')) {
                    token.meta = {
                        sourceFile: '_includes/chapter.md',
                        includeChain: [{file: 'index.md', line: 3}],
                    };
                }
            });
        };
        const diagnostics = await lintWithLocalAnchors('\n\n' + CONTENT, 'index.md', {
            plugins: [markerPlugin, include],
        });
        expect(diagnostics?.[0].lineNumber).toBe(3);
        expect(diagnostics?.[0].errorContext).toBe(
            'index.md:3 → _includes/chapter.md:3 ↛ #missing',
        );
    });

    it('runs transform plugins and parses the source only once', async () => {
        const parse = vi.fn();
        const plugin = (md: MarkdownIt) => {
            md.core.ruler.push('test-parse-count', parse);
        };
        expect(
            await lintWithLocalAnchors(CONTENT, 'index.md', {plugins: [markerPlugin, plugin]}),
        ).toHaveLength(1);
        expect(parse).toHaveBeenCalledTimes(1);
    });

    it('works when all existing rules and legacy inline diagnostics are disabled', async () => {
        const lintConfig: RawLintConfig = {default: false};
        for (let index = 1; index < 24; index++) {
            lintConfig[`YFM${String(index).padStart(3, '0')}`] = false;
        }
        const diagnostics = await lint(
            '<!-- markdownlint-disable-file YFM002 -->\n' + CONTENT,
            lintConfig,
        );
        expect(diagnostics).toHaveLength(1);
        expect(diagnostics?.[0].ruleNames[0]).toBe('YFM024');
    });

    it('preserves unrelated diagnostics when no anchor is missing', async () => {
        const diagnostics = await lint('[unreachable](#unreachable)');
        expect(diagnostics?.map(({ruleNames, level}) => [ruleNames[0], level])).toEqual([
            ['YFM003', LogLevels.ERROR],
        ]);
    });
});

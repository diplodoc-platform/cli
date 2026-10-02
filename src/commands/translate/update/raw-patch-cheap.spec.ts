import type {Snapshot} from './types';

import {describe, expect, it} from 'vitest';

import {patchLiteralLines} from './raw-patch';
import {runUpdate} from './run';

const before = '```bash\nyt list /old\n```';
const after = '```bash\nyt list /new\n```';
const snapshot = (sourceBefore: string, sourceAfter: string, targetBefore: string): Snapshot => ({
    entry: {
        kind: 'update',
        sourcePath: 'ru/a.md',
        targetPath: 'en/a.md',
        sourceBeforePath: 'b',
        sourceAfterPath: 'a',
        targetBeforePath: 't',
    },
    sourceBefore,
    sourceAfter,
    targetBefore,
});
const forbidden = async (): Promise<never> => {
    throw new Error('Literal code must not call translator');
};

describe('exact complete fenced code patches', () => {
    it('keeps already applied code byte exact without a provider or refusal', async () => {
        const target = '# Commands\r\n\r\n' + after + '\r\n\r\nHuman suffix  \r\n';
        const result = await runUpdate(
            snapshot(
                '# Commands\n\n' + before + '\n\nOriginal suffix',
                '# Commands\n\n' + after + '\n\nOriginal suffix',
                target,
            ),
            forbidden,
        );
        expect(result.output).toBe(target);
        expect(result.rejected).toBe(0);
        expect(result.diagnostics).toEqual([]);
    });
    it.each(['\n', '\r\n'])(
        'replaces the whole identical code block with added lines (%j)',
        (eol) => {
            const b = before.replace(/\n/g, eol);
            const a = '```bash\nyt list /new\nyt list /more\n```'.replace(/\n/g, eol);
            expect(patchLiteralLines(b, a, b)).toBe(a);
            expect(patchLiteralLines(b, a, a)).toBe(a);
            expect(patchLiteralLines(a, b, a)).toBe(b);
        },
    );
    it('supports a complete tilde fence with a longer closing fence', () => {
        expect(patchLiteralLines('~~~sh\na\n~~~~', '~~~sh\na\nb\n~~~~', '~~~sh\na\n~~~~')).toBe(
            '~~~sh\na\nb\n~~~~',
        );
    });
    it.each([
        ['prose', 'Old prose', 'New prose', 'New prose'],
        ['metadata', '---\na: old\n---', '---\na: new\n---', '---\na: new\n---'],
        ['diverged command', before, after, '```bash\nyt list /local\n```'],
        [
            'translated comment',
            '```sh\n# старый\na\n```',
            '```sh\n# старый\na\nb\n```',
            '```sh\n# Old\na\n```',
        ],
        ['missing close', '```sh\na', '```sh\na\nb', '```sh\na\nb'],
        ['short close', '````sh\na\n```', '````sh\na\nb\n```', '````sh\na\nb\n```'],
        ['wrong close', '```sh\na\n~~~', '```sh\na\nb\n~~~', '```sh\na\nb\n~~~'],
        ['inline span', '```old```', '```new```', '```new```'],
        ['extra prose', before, after + '\nText', after + '\nText'],
        ['early close', before, '```bash\na\n```\nb\n```', '```bash\na\n```\nb\n```'],
        ['two fences', before, after + '\n' + after, after + '\n' + after],
        ['different line endings', before, after, after.replace(/\n/g, '\r\n')],
    ])('does not widen literal acceptance for %s', (_name, b, a, t) => {
        expect(patchLiteralLines(b, a, t)).toBeUndefined();
    });
    it('refuses repeated ambiguous code blocks', async () => {
        const result = await runUpdate(
            snapshot(
                '# Commands\n\n' + before + '\n\n' + before,
                '# Commands\n\n' + after + '\n\n' + before,
                '# Commands\n\n' + after + '\n\n' + before,
            ),
            forbidden,
        );
        expect(result.output).toBeNull();
        expect(result.rejected).toBeGreaterThan(0);
    });
    it('keeps conditional audience guard', async () => {
        const result = await runUpdate(
            snapshot(
                '{% if audience == "internal" %}\n' + before + '\n{% endif %}',
                '{% if audience == "internal" %}\n' + after + '\n{% endif %}',
                '{% if audience == "internal" %}\n' + after + '\n{% endif %}',
            ),
            forbidden,
        );
        expect(result.output).toBeNull();
        expect(result.rejected).toBeGreaterThan(0);
    });
});

// Literal metrics dump example from PR14754165, without modifying its snapshots.
it('updates metrics duration and max-points-per-series while preserving all surrounding target bytes', async () => {
    const b =
        '```bash\nyt admin metrics dump --spec spec.yaml \\\n  --from-ts <ISO8601> --to-ts <ISO8601> \\\n  --prometheus-url <url> [--step <step>] [--output metrics.zip] [--max-series N] [--force]\n```';
    const a =
        '```bash\nyt admin metrics dump --spec spec.yaml \\\n  --from-ts <ISO8601> --to-ts <ISO8601> \\\n  --prometheus-url <url> [--step <duration>] [--output metrics.zip] \\\n  [--max-series N] [--max-points-per-series N] [--force]\n```';
    const prefix = '# Metrics\r\n\r\nHuman introduction  \r\n\r\n';
    const suffix = '\r\n\r\nHuman option explanation `local`  \r\n';
    const result = await runUpdate(
        snapshot('# Metrics\n\n' + b, '# Metrics\n\n' + a, prefix + b + suffix),
        forbidden,
    );
    expect(result.rejected).toBe(0);
    expect(result.output).toBe(prefix + a + suffix);
    expect(result.output).toContain('[--step <duration>]');
    expect(result.output).toContain('[--max-points-per-series N]');
});

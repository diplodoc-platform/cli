import {execFileSync} from 'node:child_process';
import {mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {load} from 'js-yaml';

import {TestAdapter} from '../fixtures';

describe('build manifest article modification dates', () => {
    let root: string;
    let input: string;
    const createdAt = '2026-01-10T12:00:00Z';
    const includeUpdatedAt = '2026-03-20T12:00:00Z';

    function git(args: string[], date = createdAt) {
        return execFileSync(
            'git',
            [
                '-C',
                input,
                '-c',
                'core.hooksPath=/dev/null',
                '-c',
                'commit.gpgsign=false',
                '-c',
                'user.name=Fixture',
                '-c',
                'user.email=fixture@example.com',
                ...args,
            ],
            {
                env: {...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date},
                stdio: 'pipe',
            },
        );
    }

    beforeAll(() => {
        // Expand Windows 8.3 names to match the paths used by the async scope checks.
        root = realpathSync.native(mkdtempSync(join(tmpdir(), 'diplodoc-manifest-dates-')));
        input = join(root, 'input');
        mkdirSync(join(input, '_includes'), {recursive: true});
        writeFileSync(
            join(input, '.yfm'),
            [
                'extensions: [github-vcs]',
                'vcs:',
                '  enabled: true',
                '  owner: fixture',
                '  repo: fixture',
                'mtimes: true',
                'lint: false',
                '',
            ].join('\n'),
        );
        writeFileSync(
            join(input, 'toc.yaml'),
            [
                'title: Dates',
                'items:',
                '- name: Home',
                '  href: index.md',
                '- name: Guide',
                '  href: guide.md',
                '- name: Landing',
                '  href: landing.yaml',
                '',
            ].join('\n'),
        );
        writeFileSync(join(input, 'index.md'), '# Home\n');
        writeFileSync(
            join(input, 'guide.md'),
            '# Guide\n\n{% include [Common](_includes/common.md) %}\n',
        );
        writeFileSync(join(input, 'landing.yaml'), 'title: Landing\nlinks: []\n');
        writeFileSync(join(input, '_includes/common.md'), 'Original include\n');
        git(['init']);
        git(['add', '.']);
        git(['commit', '-m', 'Create fixture']);
        writeFileSync(join(input, '_includes/common.md'), 'Updated include\n');
        git(['add', '_includes/common.md']);
        git(['commit', '-m', 'Update include'], includeUpdatedAt);
    });

    afterAll(() => {
        if (root) {
            rmSync(root, {recursive: true, force: true});
        }
    });

    it.each([1, 2])(
        'publishes finalized Markdown, include and leading dates with --jobs %s',
        async (jobs) => {
            const output = join(root, `with-dates-${jobs}`);
            await TestAdapter.testBuildPass(input, output, {
                md2html: false,
                args: `--jobs ${jobs}`,
            });
            const manifest = JSON.parse(
                readFileSync(join(output, 'yfm-build-manifest.json'), 'utf8'),
            );
            expect(manifest.pageModifiedTimes).toEqual({
                index: '2026-01-10T12:00:00.000Z',
                guide: '2026-03-20T12:00:00.000Z',
                landing: '2026-01-10T12:00:00.000Z',
            });
            const guide = readFileSync(join(output, 'guide.md'), 'utf8');
            expect(guide).toContain(includeUpdatedAt.replace('Z', '.000Z'));
            const landing = load(readFileSync(join(output, 'landing.yaml'), 'utf8')) as {
                meta: {updatedAt: string};
            };
            expect(landing.meta.updatedAt).toBe(createdAt.replace('Z', '.000Z'));
        },
    );

    it.each([1, 2])('omits the date map with mtimes disabled and --jobs %s', async (jobs) => {
        const output = join(root, `without-dates-${jobs}`);
        await TestAdapter.testBuildPass(input, output, {
            md2html: false,
            args: `--jobs ${jobs} --no-mtimes`,
        });
        const manifest = JSON.parse(readFileSync(join(output, 'yfm-build-manifest.json'), 'utf8'));
        expect(manifest).not.toHaveProperty('pageModifiedTimes');
    });
});

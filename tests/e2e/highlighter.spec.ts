import {mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterAll, beforeAll, describe, expect, test} from 'vitest';

import {TestAdapter} from '../fixtures';

describe('explicit CLI-owned highlighter', () => {
    let directory: string;
    let input: string;

    beforeAll(async () => {
        directory = await realpath(await mkdtemp(join(tmpdir(), 'diplodoc-highlight-')));
        input = join(directory, 'input');
        await mkdir(input);
        await writeFile(join(input, 'toc.yaml'), 'items:\n  - name: Code\n    href: index.md\n');
        await writeFile(
            join(input, 'index.md'),
            [
                '# Code',
                '```javascript showLineNumbers wrap\nconst answer = "<safe>&";\n```',
                '```typescript\ninterface Message { text: string }\n```',
                '```yaml\nservice: viewer\nreplicas: 3\n```',
                '```bash prompt="$"\n$ echo "<safe>&"\n```',
                '```unknown-language\n<script>escaped</script>&\n```',
                '{% changelog %}\n\n```yaml\ndate: 2026-10-27\n```\n\n## Release\n\nRelease body {.release-body}\n\n```javascript\nconst shipped = true;\n```\n\n{% endchangelog %}',
            ].join('\n\n'),
        );
    });

    afterAll(async () => {
        await rm(directory, {recursive: true, force: true});
    });

    test('keeps full language markup and code features in the actual HTML build', async () => {
        const output = join(directory, 'html');
        const report = await TestAdapter.build.run(input, output, [
            '-f',
            'html',
            '--no-vcs',
            '--no-search',
            '--id-generator',
            'deterministic',
        ]);
        expect(report.code).toBe(0);
        expect(report.errors).toEqual([]);
        const html = await readFile(join(output, 'index.html'), 'utf8');
        for (const language of ['javascript', 'typescript', 'yaml', 'bash']) {
            expect(html).toContain('hljs ' + language);
        }
        expect(html).toContain('hljs-keyword');
        expect(html).toContain('yfm-code-prompt');
        expect(html).toContain('yfm-clipboard-button');
        expect(html).toContain('yfm-wrapping-button');
        // The static page embeds rendered HTML inside an escaped hydration payload.
        expect(html).toContain('&amp;lt;script&amp;gt;escaped&amp;lt;/script&amp;gt;&amp;amp;');
        expect(html).not.toContain('<script>escaped</script>');
    });

    test('keeps highlighting in the separate Markdown changelog collector', async () => {
        const output = join(directory, 'md');
        const report = await TestAdapter.build.run(input, output, [
            '-f',
            'md',
            '--changelogs',
            '--no-vcs',
            '--no-search',
        ]);
        expect(report.code).toBe(0);
        expect(report.errors).toEqual([]);
        expect(report.warns.some((warning) => warning.includes('TRANSFORM_BUNDLED_LIQUID'))).toBe(
            true,
        );
        expect(report.warns.some((warning) => warning.includes('index.md'))).toBe(true);
        const [name] = await readdir(join(output, 'changelogs'));
        const item = JSON.parse(await readFile(join(output, 'changelogs', name), 'utf8'));
        expect(item.title).toBe('Release');
        // The collector renders before the attrs rule; preserve its established literal body.
        expect(item.description).toContain('<p>Release body {.release-body}</p>');
        expect(item.description).toContain('<code class="hljs javascript">');
        expect(item.description).toContain('<span class="hljs-keyword">const</span>');
    });
});

import {mkdir, mkdtemp, readFile, realpath, rm, utimes, writeFile} from 'node:fs/promises';
import {dirname, join, relative} from 'node:path';
import {tmpdir} from 'node:os';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import {parse} from '~/commands';
import {stats} from '~/core/logger';

import {Build, Run} from './index';

class NativeRun extends Run {
    get manifest(): Run['manifest'] {
        return require('@diplodoc/client/manifest');
    }
}

class NativeBuild extends Build {
    captured!: Run;

    private selective: boolean;

    constructor(selective: boolean) {
        super();
        this.selective = selective;
    }

    protected createRun() {
        this.captured = new NativeRun(this.config, {selective: this.selective});
        return this.captured;
    }
}

describe('native selective build adapters', () => {
    let root: AbsolutePath;
    let input: AbsolutePath;
    let sequence: number;

    async function source(path: string, content: string) {
        const target = join(input, path);
        await mkdir(dirname(target), {recursive: true});
        await writeFile(target, content);
    }

    async function build(
        format: string,
        selective: boolean,
        extra: string[] = [],
        allowErrors = false,
    ) {
        const output = join(root, `output-${sequence++}`);
        const command = new NativeBuild(selective);
        const argv = [
            'node',
            'index',
            '-i',
            input,
            '-o',
            output,
            '-f',
            format,
            '--no-lint',
            '--no-vcs',
            '--no-vcs-path',
            '--no-build-stats',
            '--no-build-content',
            '--ignore',
            '**/*/toc.yaml',
            ...extra,
        ];
        await command.init(parse(argv, 'build'));
        await command.parse(argv);
        expect(command.report.code).toBe(0);
        const errors = stats(command.logger).error;
        if (!allowErrors) {
            expect(errors).toBe(0);
        }
        return {
            output,
            errors,
            run: command.captured,
            dependencies: command.captured.sources.dependencies.map((path) =>
                relative(input, path),
            ),
        };
    }

    beforeEach(async () => {
        const temporary = await mkdtemp(join(tmpdir(), 'yfm-native-adapters-'));
        root = (await realpath(temporary as AbsolutePath)) as AbsolutePath;
        input = join(root, 'source');
        await mkdir(input);
        sequence = 0;
    });

    afterEach(async () => {
        await rm(root, {recursive: true, force: true});
    });

    it.each(['md', 'html'])(
        'preserves selected %s content, assets and source modification times',
        async (format) => {
            await source('toc.yaml', 'title: Native\nitems:\n  - name: Page\n    href: index.md');
            await source(
                'index.md',
                '# Native\n\n{% include [part](part.md) %}\n\n![Image](image.svg)',
            );
            await source('part.md', 'Included native content.');
            await source(
                'image.svg',
                '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg>',
            );
            await source('unused/presets.yaml', 'default: {unused: true}');
            await source('unused/passthrough.txt', 'unrelated');
            await source(
                '.yfm',
                'resources:\n  style: [custom.css]\n  script: [custom.js]\nallowCustomResources: true',
            );
            await source('custom.css', 'body { color: red; }');
            await source('custom.js', 'console.log("native");');
            const modified = new Date('2020-01-02T03:04:05Z');
            await utimes(join(input, 'index.md'), modified, modified);
            await utimes(join(input, 'part.md'), modified, modified);

            const ordinary = await build(format, false, ['--mtimes']);
            const selected = await build(format, true, ['--mtimes']);
            const page = format === 'html' ? 'index.html' : 'index.md';
            const actual = await readFile(join(selected.output, page), 'utf8');
            const expected = await readFile(join(ordinary.output, page), 'utf8');
            expect(actual).toBe(expected);
            expect(actual).toContain('Included native content.');
            for (const path of ['index.md', 'part.md', 'image.svg', 'custom.css', 'custom.js']) {
                expect(selected.dependencies).toContain(path);
            }
            expect(selected.dependencies).not.toContain('unused/passthrough.txt');
            expect(await readFile(join(selected.output, 'image.svg'), 'utf8')).toBe(
                await readFile(join(input, 'image.svg'), 'utf8'),
            );
        },
    );

    it('collects rendered HTML and plain leading HTML resources including nested local documents', async () => {
        await source(
            'toc.yaml',
            'title: Native\nitems:\n  - name: Page\n    href: index.md\n  - name: Start\n    href: start.yaml',
        );
        await source('.yfm', 'allowHtml: true\nsanitizeHtml: false');
        await source(
            'index.md',
            '# Native\n\n<iframe src="viewer.html"></iframe><script src="local.js"></script>',
        );
        await source(
            'start.yaml',
            'title: \'<img src="title.svg">\'\ndescription: \'<iframe src="viewer.html"></iframe>\'\nlinks: [{title: Page, href: index.md}]',
        );
        await source(
            'viewer.html',
            '<video poster="poster.png"><source src="movie.mp4"></video><iframe src="viewer.html"></iframe>',
        );
        for (const path of ['title.svg', 'local.js', 'poster.png', 'movie.mp4', 'unused.html']) {
            await source(path, path);
        }

        const result = await build('html', true);

        for (const path of ['viewer.html', 'title.svg', 'local.js', 'poster.png', 'movie.mp4']) {
            expect(result.dependencies).toContain(path);
            expect(await readFile(join(result.output, path), 'utf8')).toBe(
                await readFile(join(input, path), 'utf8'),
            );
        }
        expect(result.dependencies).not.toContain('unused.html');
        expect(await readFile(join(result.output, 'start.html'), 'utf8')).toContain('index.html');
    });

    it.each(['md', 'html'])(
        'stages native %s OpenAPI refs while selecting only native custom landing pages',
        async (format) => {
            await source(
                'toc.yaml',
                `title: API
items:
  - name: API
    include:
      mode: link
      path: api
      includers:
        - name: openapi
          input: spec.yaml
          tags:
            __root__: {path: root.md}
            Pets: {path: pets.md}
            Unused: {path: absent.md}
            Unselected: {path: unselected.md}
            Hidden: {hidden: true, path: hidden.md}
`,
            );
            await source(
                'spec.yaml',
                'openapi: 3.0.0\ninfo:\n  title: Native\n  version: 1.0.0\npaths:\n  /pets:\n    get:\n      tags: [Pets]\n      responses:\n        "200":\n          description: ok\n          content:\n            application/json:\n              schema:\n                $ref: "schemas/pet.yaml#/Pet"',
            );
            await source(
                'schemas/pet.yaml',
                'Pet:\n  type: object\n  properties:\n    child:\n      $ref: "nested/child.yaml#/Child"',
            );
            await source(
                'schemas/nested/child.yaml',
                'Child:\n  type: object\n  properties:\n    parent:\n      $ref: "../pet.yaml#/Pet"',
            );
            await source('root.md', '# Custom root');
            await source('pets.md', '# Custom pets');
            await source('hidden.md', '# Hidden custom page');
            await source('unselected.md', '# Unselected custom page');
            await source('unrelated.yaml', 'invalid: [');

            const ordinary = await build(format, false);
            const selected = await build(format, true);

            for (const path of [
                'spec.yaml',
                'schemas/pet.yaml',
                'schemas/nested/child.yaml',
                'root.md',
                'pets.md',
            ]) {
                expect(selected.dependencies).toContain(path);
            }
            for (const path of ['absent.md', 'hidden.md', 'unselected.md', 'unrelated.yaml']) {
                expect(selected.dependencies).not.toContain(path);
            }
            for (const path of [`api/index.${format}`, `api/Pets/index.${format}`]) {
                expect(await readFile(join(selected.output, path), 'utf8')).toBe(
                    await readFile(join(ordinary.output, path), 'utf8'),
                );
            }
        },
    );

    it.each(['md', 'html'])(
        'preserves native %s oversized image diagnostics with a lazy source',
        async (format) => {
            await source('.yfm', '{}');
            await source('toc.yaml', 'title: Native\nitems: [{name: Page, href: index.md}]');
            await source('index.md', '# Page\n\n![Large](large.png)');
            await source('large.png', 'larger than four bytes');

            const ordinary = await build(format, false, ['--max-asset-size', '4'], true);
            const selected = await build(format, true, ['--max-asset-size', '4'], true);

            expect(selected.errors).toBeGreaterThan(0);
            expect(selected.errors).toBe(ordinary.errors);
            expect(selected.dependencies).toContain('large.png');
        },
    );

    it.each(['schemas%2Fpet.yaml', 'schemas%3Fpet.yaml'])(
        'preserves the literal reserved encoding in native OpenAPI reference %s',
        async (filename) => {
            await source('.yfm', '{}');
            await source(
                'toc.yaml',
                `title: API
items:
  - name: API
    include:
      path: api
      mode: link
      includers:
        - name: openapi
          input: spec.yaml
`,
            );
            await source(
                'spec.yaml',
                JSON.stringify({
                    openapi: '3.0.0',
                    info: {title: 'Native encoding', version: '1.0.0'},
                    paths: {},
                    components: {schemas: {Pet: {$ref: `${filename}#/Pet`}}},
                }),
            );
            await source(filename, 'Pet: {type: string}');
            await source('schemas/pet.yaml', 'Pet: {type: number}');

            const ordinary = await build('md', false);
            const selected = await build('md', true);

            expect(selected.dependencies).toContain(filename);
            expect(selected.dependencies).not.toContain('schemas/pet.yaml');
            expect(await readFile(join(selected.output, 'api/index.md'), 'utf8')).toBe(
                await readFile(join(ordinary.output, 'api/index.md'), 'utf8'),
            );
        },
    );
});

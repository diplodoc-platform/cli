import {resolve} from 'path';
import {describe, expect, it, vi} from 'vitest';
import {Run} from './run';

const runTestConfig = {
    input: resolve('/test/input'),
    output: resolve('/test/output'),
    source: {language: 'en', locale: ''},
    target: [{language: 'ru', locale: ''}],
    files: [],
    include: [],
    exclude: [],
    filter: true,
    skipped: [],
    vars: {},
    dryRun: false,
    strict: false,
    quiet: false,
    varsPreset: 'default',
    ignore: [],
    ignoreStage: [],
    addSystemMeta: false,
    template: {
        enabled: false,
        features: {conditions: true, substitutions: true},
        scopes: {code: false, text: false},
    },
    removeHiddenTocItems: false,
    removeEmptyTocItems: false,
    outputFormat: 'md',
    allowHtml: true,
    sanitizeHtml: false,
    lang: 'en',
    langs: ['en'],
};

vi.mock('~/core/vars', () => ({
    VarsService: vi.fn().mockImplementation(() => ({
        init: vi.fn().mockResolvedValue(undefined),
        for: vi.fn().mockReturnValue({}),
    })),
}));

vi.mock('~/core/meta', () => ({
    MetaService: vi.fn().mockImplementation(() => ({
        add: vi.fn(),
        addMetadata: vi.fn(),
        addSystemVars: vi.fn(),
    })),
}));

vi.mock('~/core/toc', () => ({
    TocService: vi.fn().mockImplementation(() => ({
        init: vi.fn().mockResolvedValue(undefined),
        entries: ['entry1.md', 'entry2.md'],
    })),
}));

vi.mock('~/core/markdown/MarkdownService', () => {
    return {
        MarkdownService: vi.fn().mockImplementation(() => ({
            init: vi.fn().mockResolvedValue(undefined),
            deps: () => [
                [
                    {path: 'main.md', location: [1, 2]},
                    [
                        {path: 'dep1.md', location: [3, 4]},
                        {path: 'dep2.md', location: [5, 6]},
                    ],
                ],
                [
                    {path: 'main2.md', location: [1, 2]},
                    [
                        {path: 'main.md', location: [1, 2]},
                        {path: 'dep1.md', location: [1, 2]},
                    ],
                ],
                [
                    {path: 'main3.md', location: [1, 2]},
                    [
                        {path: 'main.md', location: [1, 2]},
                        {path: 'dep1.md', location: [1, 2]},
                    ],
                ],
            ],
        })),
    };
});

describe('Run context', async () => {
    it('should flatten the nested deps array returned by markdown.deps and return set of unique files', async () => {
        const run = new Run(runTestConfig as any);

        Object.defineProperty(run, 'tocYamlList', {
            value: new Set(['toc.yaml']),
            writable: true,
        });

        const [files, _] = await run.getFiles();

        expect(files).toEqual([
            'entry1.md',
            'entry2.md',
            'main.md',
            'dep1.md',
            'dep2.md',
            'main2.md',
            'main3.md',
            'toc.yaml',
        ]);
    });
});

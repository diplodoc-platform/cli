import type {Build} from '~/commands/build';
import type {RawToc} from '~/core/toc';
import type {MockInstance} from 'vitest';

import {join} from 'node:path';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {when} from 'vitest-when';
import {load} from 'js-yaml';
import {dedent} from 'ts-dedent';

import {run, runBuild, setupBuild} from '../../__tests__';
import {getHooks as getTocHooks} from '~/core/toc';
import {normalizePath} from '~/core/utils';

import * as _watch from './Watcher';

type Event = {
    type: string;
    file: RelativePath;
};

const watch = _watch as typeof _watch & {
    reset(): void;
    ready(): Promise<void>;
    event(event: Event): Promise<void>;
    end(): void;
};

vi.mock('node:http', () => ({
    createServer: () => ({
        listen: vi.fn(() => ({
            close: vi.fn(),
        })),
    }),
}));
vi.mock('./Watcher', () => {
    class Defer<T = any> {
        promise: Promise<T>;

        resolve!: (result: T) => void;

        reject!: (error: unknown) => void;

        constructor() {
            this.promise = new Promise((resolve, reject) => {
                this.resolve = resolve;
                this.reject = reject;
            });
        }
    }

    let ready = new Defer<void>();
    let event = new Defer<Event | null>();
    let wait = new Defer<void>();

    return {
        event: async ({type, file}: Event) => {
            event.resolve({type, file: normalizePath(file)});
            return wait.promise;
        },
        ready: () => ready.promise,
        reset: () => {
            event = new Defer();
            ready = new Defer();
            wait = new Defer();
        },
        end: (error?: unknown) => {
            if (error) {
                wait.reject(error);
            } else {
                wait.resolve();
            }

            if (event) {
                event.resolve(null);
            }
        },
        Watcher: function () {
            return {
                events: (async function* () {
                    ready.resolve();

                    let value: Event | null = null;
                    // eslint-disable-next-line no-cond-assign
                    while ((value = await event.promise)) {
                        event = new Defer();

                        yield value;

                        wait.resolve();
                        wait = new Defer();
                    }
                })(),
            };
        },
    };
});

const args = (...args: string[]) => '-i /dev/null/input -o /dev/null/output -w ' + args.join(' ');

describe('Build watch feature', () => {
    let build: Build, promise: Promise<void>, processEntry: MockInstance;

    async function setup() {
        build = setupBuild();
        promise = runBuild(args('-f', 'html', '--vars-preset', 'internal'), build);

        promise.catch(watch.end);

        processEntry = vi.spyOn(build, 'processEntry');

        await watch.ready();
    }

    async function register(path: RelativePath, content: string | Error) {
        const origin = normalizePath(join(run(build).originalInput, path)) as AbsolutePath;
        const input = normalizePath(join(run(build).input, path)) as AbsolutePath;

        if (content instanceof Error) {
            when(run(build).exists).calledWith(origin).thenReturn(false);
            when(run(build).exists).calledWith(input).thenReturn(false);
            when(run(build).read).calledWith(input).thenReject(content);
        } else {
            when(run(build).exists).calledWith(origin).thenReturn(true);
            when(run(build).exists).calledWith(input).thenReturn(true);
            when(run(build).read).calledWith(input).thenResolve(content);
        }
    }

    async function create(path: RelativePath, content: string | Error) {
        await register(path, content);
        await watch.event({type: 'add', file: path});
    }

    async function change(path: RelativePath, content: string | Error) {
        await register(path, content);
        await watch.event({type: 'change', file: path});
    }

    async function remove(path: RelativePath) {
        await register(path, new Error('ENOENT'));
        await watch.event({type: 'unlink', file: path});
    }

    function hasNode(store: 'toc' | 'vars' | 'entry', node: string, value = true) {
        expect(run(build)[store].relations.hasNode(node), `Graph ${store} has node ${node}`).toBe(
            value,
        );
    }

    function depends(store: 'toc' | 'vars' | 'entry', from: string, to: string, value = true) {
        const existsFrom = run(build)[store].relations.hasNode(from);

        if (existsFrom) {
            expect(
                run(build)[store].relations.dependenciesOf(from).includes(to),
                `Node ${from} depends on ${to} in ${store} graph`,
            ).toBe(value);
        }
    }

    function nodeData(store: 'toc' | 'vars' | 'entry', node: string, value: object) {
        expect(run(build)[store].relations.hasNode(node), `Node ${node} exists in ${store} graph`).toBe(
            true,
        );
        expect(run(build)[store].relations.getNodeData(node)).toMatchObject(value);
    }

    beforeEach(async () => {
        watch.reset();

        await setup();
    });

    afterEach(async () => {
        watch.end();
        await promise;
    });

    describe('toc', () => {
        it('should handle new empty toc', async () => {
            expect(run(build).toc.relations.hasNode('toc.yaml')).toBe(false);

            hasNode('toc', 'toc.yaml', false);

            await create('./toc.yaml', '{}');

            hasNode('toc', 'toc.yaml', true);
        });

        it('should handle new toc with missed entries', async () => {
            hasNode('toc', 'toc.yaml', false);
            hasNode('toc', 'index.yaml', false);
            hasNode('entry', 'index.yaml', false);

            await register('./index.yaml', new Error('ENOENT'));
            await create('./toc.yaml', 'href: index.yaml');

            hasNode('toc', 'toc.yaml', true);
            hasNode('toc', 'index.yaml', true);
            hasNode('entry', 'index.yaml', true);

            await create('./index.yaml', 'links: []');

            hasNode('toc', 'toc.yaml', true);
            hasNode('toc', 'index.yaml', true);
            hasNode('entry', 'index.yaml', true);
        });

        it('should handle new toc with existed entries', async () => {
            hasNode('toc', 'toc.yaml', false);
            hasNode('toc', 'index.yaml', false);
            hasNode('entry', 'index.yaml', false);

            await register('./index.yaml', 'links: []');
            await create('./toc.yaml', 'href: index.yaml');

            hasNode('toc', 'toc.yaml', true);
            hasNode('toc', 'index.yaml', true);
            hasNode('entry', 'index.yaml', true);
        });

        it('should handle new toc update', async () => {
            hasNode('toc', 'toc.yaml', false);
            hasNode('toc', 'index.yaml', false);
            hasNode('entry', 'index.yaml', false);

            await register('./index.yaml', 'links: []');
            await create('./toc.yaml', '{}');

            hasNode('toc', 'toc.yaml', true);
            hasNode('toc', 'index.yaml', false);
            hasNode('entry', 'index.yaml', false);

            await change('./toc.yaml', 'href: index.yaml');

            hasNode('toc', 'toc.yaml', true);
            hasNode('toc', 'index.yaml', true);
            hasNode('entry', 'index.yaml', true);
        });

        it('should handle new toc update to bad', async () => {
            hasNode('toc', 'toc.yaml', false);
            hasNode('toc', 'index.md', false);
            hasNode('entry', 'index.md', false);

            await register('./index.md', 'md');
            await create('./toc.yaml', 'href: index.md');

            hasNode('toc', 'toc.yaml', true);
            hasNode('toc', 'index.md', true);
            hasNode('entry', 'index.md', true);

            await change('./toc.yaml', '<>');

            hasNode('toc', 'toc.yaml', true);
            hasNode('toc', 'index.md', false);
            hasNode('entry', 'index.md', false);

            await change('./toc.yaml', 'href: index.md');

            hasNode('toc', 'toc.yaml', true);
            hasNode('toc', 'index.md', true);
            hasNode('entry', 'index.md', true);
        });

        it('should handle bad toc', async () => {
            hasNode('toc', 'toc.yaml', false);

            await create('./toc.yaml', '<>');

            hasNode('toc', 'toc.yaml', true);
        });

        it('should handle bad toc update to valid', async () => {
            hasNode('toc', 'toc.yaml', false);
            hasNode('toc', 'index.yaml', false);
            hasNode('entry', 'index.yaml', false);

            await register('./index.yaml', 'links: []');
            await create('./toc.yaml', '<>');

            hasNode('toc', 'toc.yaml', true);
            hasNode('toc', 'index.yaml', false);
            hasNode('entry', 'index.yaml', false);

            await change('./toc.yaml', 'href: index.yaml');

            hasNode('toc', 'toc.yaml', true);
            hasNode('toc', 'index.yaml', true);
            hasNode('entry', 'index.yaml', true);
        });

        it('should handle bad toc update to bad', async () => {
            hasNode('toc', 'toc.yaml', false);
            hasNode('toc', 'index.yaml', false);
            hasNode('entry', 'index.yaml', false);

            await register('./index.yaml', 'links: []');
            await create('./toc.yaml', '<>');

            hasNode('toc', 'toc.yaml', true);
            hasNode('toc', 'index.yaml', false);
            hasNode('entry', 'index.yaml', false);

            await change('./toc.yaml', '<<>>');

            hasNode('toc', 'toc.yaml', true);
            hasNode('toc', 'index.yaml', false);
            hasNode('entry', 'index.yaml', false);
        });

        it('should handle toc update source', async () => {
            hasNode('toc', 'toc.yaml', false);
            hasNode('toc', 'toc-i.yaml', false);
            hasNode('toc', 'index.md', false);
            hasNode('toc', 'about.md', false);
            hasNode('entry', 'index.md', false);
            hasNode('entry', 'about.md', false);

            await register('./index.md', 'md');
            await register('./about.md', 'md');
            await register(
                './toc-i.yaml',
                dedent`
                    items:
                      - href: index.md
                `,
            );
            await create(
                './toc.yaml',
                dedent`
                    items:
                      - include:
                          path: toc-i.yaml
                          mode: link
                `,
            );

            hasNode('toc', 'toc.yaml', true);
            hasNode('toc', 'toc-i.yaml', true);
            depends('toc', 'toc.yaml', 'toc-i.yaml');
            hasNode('toc', 'index.md', true);
            hasNode('toc', 'about.md', false);
            hasNode('entry', 'index.md', true);
            hasNode('entry', 'about.md', false);

            await change(
                './toc-i.yaml',
                dedent`
                    items:
                      - href: index.md
                      - href: about.md
                `,
            );

            hasNode('toc', 'toc.yaml', true);
            hasNode('toc', 'toc-i.yaml', true);
            depends('toc', 'toc.yaml', 'toc-i.yaml');
            hasNode('toc', 'index.md', true);
            hasNode('toc', 'about.md', true);
            hasNode('entry', 'index.md', true);
            hasNode('entry', 'about.md', true);

            await change(
                './toc-i.yaml',
                dedent`
                    items:
                      - href: index.md
                `,
            );

            hasNode('toc', 'toc.yaml', true);
            hasNode('toc', 'toc-i.yaml', true);
            depends('toc', 'toc.yaml', 'toc-i.yaml');
            hasNode('toc', 'index.md', true);
            hasNode('toc', 'about.md', false);
            hasNode('entry', 'index.md', true);
            hasNode('entry', 'about.md', false);
        });

        it('should handle toc update includer source', async () => {
            const service = run(build).toc;
            getTocHooks(service)
                .Includer.for('mock-openapi')
                .tapPromise('Tests', async (_rawtoc, options) => {
                    const input = normalizePath(options.input);
                    service.relations.addNode(input, {type: 'source', data: undefined});
                    service.relations.addDependency('toc.yaml', input);

                    const file = normalizePath(join(run(build).input, options.input));
                    const content = await run(build).read(file as AbsolutePath);

                    return load(content) as RawToc;
                });

            hasNode('toc', 'toc.yaml', false);
            hasNode('toc', 'openapi-spec.yaml', false);
            hasNode('toc', 'methodA.md', false);
            hasNode('toc', 'methodB.md', false);

            await register('./openapi/methodA.md', 'md');
            await register('./openapi/methodB.md', 'md');
            await register(
                './openapi-spec.yaml',
                dedent`
                    items:
                      - href: methodA.md
                `,
            );
            await create(
                './toc.yaml',
                dedent`
                    items:
                      - include:
                          path: openapi
                          includers:
                            - name: mock-openapi
                              input: openapi-spec.yaml
                `,
            );

            hasNode('toc', 'toc.yaml', true);
            hasNode('toc', 'openapi-spec.yaml', true);
            hasNode('toc', 'openapi/methodA.md', true);
            hasNode('toc', 'openapi/methodB.md', false);
            depends('toc', 'toc.yaml', 'openapi-spec.yaml', true);
            depends('toc', 'toc.yaml', 'openapi/methodA.md', true);
            depends('toc', 'toc.yaml', 'openapi/methodB.md', false);

            await change(
                './openapi-spec.yaml',
                dedent`
                    items:
                      - href: methodA.md
                      - href: methodB.md
                `,
            );

            hasNode('toc', 'toc.yaml', true);
            hasNode('toc', 'openapi-spec.yaml', true);
            hasNode('toc', 'openapi/methodA.md', true);
            hasNode('toc', 'openapi/methodB.md', true);
            depends('toc', 'toc.yaml', 'openapi-spec.yaml', true);
            depends('toc', 'toc.yaml', 'openapi/methodA.md', true);
            depends('toc', 'toc.yaml', 'openapi/methodB.md', true);

            await change(
                './openapi-spec.yaml',
                dedent`
                    items:
                      - href: methodB.md
                `,
            );

            hasNode('toc', 'toc.yaml', true);
            hasNode('toc', 'openapi-spec.yaml', true);
            hasNode('toc', 'openapi/methodA.md', false);
            hasNode('toc', 'openapi/methodB.md', true);
            depends('toc', 'toc.yaml', 'openapi-spec.yaml', true);
            depends('toc', 'toc.yaml', 'openapi/methodA.md', false);
            depends('toc', 'toc.yaml', 'openapi/methodB.md', true);
        });

        it('should handle toc source detach', async () => {
            hasNode('toc', 'toc.yaml', false);
            hasNode('toc', 'toc-i.yaml', false);
            hasNode('toc', 'inner/index.md', false);
            hasNode('toc', 'about.md', false);
            hasNode('entry', 'inner/index.md', false);
            hasNode('entry', 'about.md', false);

            await register('./inner/index.md', 'md');
            await register('./about.md', 'md');
            await register(
                './inner/toc.yaml',
                dedent`
                    items:
                      - href: index.md
                `,
            );
            await create(
                './toc.yaml',
                dedent`
                    items:
                      - href: about.md
                      - include:
                          path: inner/toc.yaml
                          mode: link
                `,
            );

            hasNode('toc', 'toc.yaml', true);
            hasNode('toc', 'inner/toc.yaml', true);
            depends('toc', 'toc.yaml', 'inner/toc.yaml');
            hasNode('toc', 'inner/index.md', true);
            hasNode('toc', 'about.md', true);
            hasNode('entry', 'inner/index.md', true);
            hasNode('entry', 'about.md', true);

            await change('./toc.yaml', '<>');

            hasNode('toc', 'toc.yaml', true);
            hasNode('toc', 'inner/toc.yaml', true);
            depends('toc', 'toc.yaml', 'inner/toc.yaml', false);
            hasNode('toc', 'inner/index.md', true);
            hasNode('toc', 'about.md', false);
            hasNode('entry', 'inner/index.md', true);
            hasNode('entry', 'about.md', false);
        });

        it('should handle simple toc remove', async () => {
            hasNode('toc', 'toc.yaml', false);
            hasNode('toc', 'index.md', false);
            hasNode('toc', 'about.md', false);
            hasNode('entry', 'index.md', false);
            hasNode('entry', 'about.md', false);

            await register('./index.md', 'md');
            await register('./about.md', 'md');
            await create(
                './toc.yaml',
                dedent`
                    items:
                      - href: index.md
                      - href: about.md
                `,
            );

            hasNode('toc', 'toc.yaml', true);
            hasNode('toc', 'index.md', true);
            hasNode('toc', 'about.md', true);
            hasNode('entry', 'index.md', true);
            hasNode('entry', 'about.md', true);
            depends('toc', 'toc.yaml', 'index.md', true);
            depends('toc', 'toc.yaml', 'about.md', true);

            await remove('./toc.yaml');

            hasNode('toc', 'toc.yaml', false);
            hasNode('toc', 'index.md', false);
            hasNode('toc', 'about.md', false);
            hasNode('entry', 'index.md', false);
            hasNode('entry', 'about.md', false);
            depends('toc', 'toc.yaml', 'index.md', false);
            depends('toc', 'toc.yaml', 'about.md', false);
        });

        it('should handle toc with subtoc remove', async () => {
            hasNode('toc', 'toc.yaml', false);
            hasNode('toc', 'inner/toc.yaml', false);
            hasNode('toc', 'index.md', false);
            hasNode('toc', 'inner/about.md', false);
            hasNode('entry', 'index.md', false);
            hasNode('entry', 'inner/about.md', false);

            await register('./index.md', 'md');
            await register('./inner/about.md', 'md');
            await register(
                './inner/toc.yaml',
                dedent`
                    items:
                      - href: about.md
                `,
            );
            await create(
                './toc.yaml',
                dedent`
                    items:
                      - href: index.md
                      - include: {mode: 'link', path: './inner/toc.yaml'}
                `,
            );

            hasNode('toc', 'toc.yaml', true);
            hasNode('toc', 'inner/toc.yaml', true);
            hasNode('toc', 'index.md', true);
            hasNode('toc', 'inner/about.md', true);
            hasNode('entry', 'index.md', true);
            hasNode('entry', 'inner/about.md', true);
            depends('toc', 'toc.yaml', 'inner/toc.yaml', true);
            depends('toc', 'toc.yaml', 'index.md', true);
            depends('toc', 'toc.yaml', 'inner/about.md', true);
            nodeData('toc', 'toc.yaml', {type: 'toc'});
            nodeData('toc', 'inner/toc.yaml', {type: 'source'});

            await remove('./toc.yaml');

            hasNode('toc', 'toc.yaml', false);
            hasNode('toc', 'inner/toc.yaml', true);
            hasNode('toc', 'index.md', false);
            hasNode('toc', 'inner/about.md', true);
            hasNode('entry', 'index.md', false);
            hasNode('entry', 'inner/about.md', true);
            depends('toc', 'toc.yaml', 'inner/toc.yaml', false);
            depends('toc', 'toc.yaml', 'index.md', false);
            depends('toc', 'toc.yaml', 'inner/about.md', false);
            depends('toc', 'inner/toc.yaml', 'inner/about.md', true);
            nodeData('toc', 'inner/toc.yaml', {type: 'toc'});
        });
    });

    describe('vars', () => {
        it('should handle new empty preset', async () => {
            hasNode('vars', 'presets.yaml', false);

            await create('./presets.yaml', '');

            hasNode('vars', 'presets.yaml', true);
        });

        it('should handle entry dependency after preset', async () => {
            hasNode('vars', 'presets.yaml', false);
            hasNode('vars', 'presets.yaml#default.var', false);
            hasNode('toc', 'toc.yaml', false);
            hasNode('toc', 'index.md', false);
            hasNode('entry', 'index.md', false);

            await register('./index.md', 'Title {{var}}');
            await create(
                './presets.yaml',
                dedent`
                default:
                    var: value
            `,
            );
            await create('./toc.yaml', 'href: index.md');

            hasNode('vars', 'presets.yaml', true);
            hasNode('vars', 'presets.yaml#default.var', true);
            hasNode('vars', 'index.md', true);
            depends('vars', 'index.md', 'presets.yaml#default.var');
            hasNode('toc', 'toc.yaml', true);
            hasNode('toc', 'index.md', true);
            hasNode('entry', 'index.md', true);
        });

        it('should handle entry dependency before preset', async () => {
            hasNode('vars', 'presets.yaml', false);
            hasNode('vars', 'presets.yaml#default.var', false);
            hasNode('toc', 'toc.yaml', false);
            hasNode('toc', 'index.md', false);
            hasNode('entry', 'index.md', false);

            await register('./index.md', 'Title {{var}}');
            await create('./toc.yaml', 'href: index.md');
            await create(
                './presets.yaml',
                dedent`
                default:
                    var: value
            `,
            );

            hasNode('vars', 'presets.yaml', true);
            hasNode('vars', 'presets.yaml#default.var', true);
            hasNode('vars', 'index.md', true);
            depends('vars', 'index.md', 'presets.yaml#default.var');
            hasNode('toc', 'toc.yaml', true);
            hasNode('toc', 'index.md', true);
            hasNode('entry', 'index.md', true);
        });

        it('should handle deep value', async () => {
            hasNode('vars', 'presets.yaml', false);
            hasNode('vars', 'presets.yaml#default.deep.deep.deep.var', false);
            hasNode('toc', 'toc.yaml', false);
            hasNode('toc', 'index.md', false);
            hasNode('entry', 'index.md', false);

            await register('./index.md', 'Title {{deep.deep.deep.var}}');
            await create('./toc.yaml', 'href: index.md');
            await create(
                './presets.yaml',
                dedent`
                default:
                  deep:
                    deep:
                      deep:
                        var: value
            `,
            );

            hasNode('vars', 'presets.yaml', true);
            hasNode('vars', 'presets.yaml#default.deep.deep.deep.var', true);
            hasNode('vars', 'index.md', true);
            depends('vars', 'index.md', 'presets.yaml#default.deep.deep.deep.var');
            hasNode('toc', 'toc.yaml', true);
            hasNode('toc', 'index.md', true);
            hasNode('entry', 'index.md', true);
            expect(processEntry).toBeCalledWith('index.md');
        });

        it('should handle preset update', async () => {
            expect(processEntry).not.toBeCalled();

            await register('./index.md', 'Title {{var}}');
            await register(
                './presets.yaml',
                dedent`
                default:
                    var: value
            `,
            );
            await create('./toc.yaml', 'href: index.md');

            expect(processEntry).toBeCalledTimes(1);

            await change(
                './presets.yaml',
                dedent`
                default:
                    var: value2
            `,
            );

            expect(processEntry).toBeCalledTimes(2);
        });

        it('should handle deep presets', async () => {
            expect(processEntry).not.toBeCalled();

            await register('./deep/index.md', 'Title {{var}}');
            await register(
                './presets.yaml',
                dedent`
                default:
                    var: value
            `,
            );
            await register(
                './deep/presets.yaml',
                dedent`
                default:
                    var: value2
            `,
            );
            await create('./toc.yaml', 'href: deep/index.md');

            expect(processEntry).toBeCalledTimes(1);

            await change(
                './presets.yaml',
                dedent`
                default:
                    var: value3
            `,
            );

            expect(processEntry).toBeCalledTimes(1);

            await change(
                './deep/presets.yaml',
                dedent`
                default:
                    var: value4
            `,
            );

            expect(processEntry).toBeCalledTimes(2);
        });

        it('should handle bubbled value with deep presets', async () => {
            expect(processEntry).not.toBeCalled();

            await register('./deep/index.md', 'Title {{var1}}');
            await create(
                './presets.yaml',
                dedent`
                default:
                    var1: value
            `,
            );
            await create(
                './deep/presets.yaml',
                dedent`
                default:
                    var2: value2
            `,
            );
            await create('./toc.yaml', 'href: deep/index.md');

            expect(processEntry).toBeCalledTimes(1);

            await change(
                './presets.yaml',
                dedent`
                default:
                    var1: value3
            `,
            );

            expect(processEntry).toBeCalledTimes(2);

            await change(
                './deep/presets.yaml',
                dedent`
                default:
                    var2: value4
            `,
            );

            expect(processEntry).toBeCalledTimes(2);
        });

        it('should handle values in multiple presets', async () => {
            expect(processEntry).not.toBeCalled();

            await register('./deep/index.md', 'Title {{var1}} {{var2}}');
            await create(
                './presets.yaml',
                dedent`
                default:
                    var1: value
            `,
            );
            await create(
                './deep/presets.yaml',
                dedent`
                default:
                    var2: value2
            `,
            );
            await create('./toc.yaml', 'href: deep/index.md');

            expect(processEntry).toBeCalledTimes(1);

            await change(
                './presets.yaml',
                dedent`
                default:
                    var1: value3
            `,
            );

            expect(processEntry).toBeCalledTimes(2);

            await change(
                './deep/presets.yaml',
                dedent`
                default:
                    var2: value4
            `,
            );

            expect(processEntry).toBeCalledTimes(3);
        });

        it('should handle addition override in presets', async () => {
            expect(processEntry).not.toBeCalled();

            await register('./deep/deep/index.md', 'Title {{deep.deep.var}}');
            await create(
                './presets.yaml',
                dedent`
                default:
                  deep:
                    deep:
                      var: value
            `,
            );
            await create(
                './deep/presets.yaml',
                dedent`
                default:
                    var: value2
            `,
            );
            await create(
                './deep/deep/presets.yaml',
                dedent`
                default:
                    var: value2
            `,
            );
            await create('./toc.yaml', 'href: deep/deep/index.md');

            expect(processEntry).toBeCalledTimes(1);
            depends('vars', 'deep/deep/index.md', 'presets.yaml#default.deep.deep.var');
            depends('vars', 'deep/deep/index.md', 'deep/presets.yaml#default.deep.deep.var', false);

            await change(
                './deep/presets.yaml',
                dedent`
                default:
                  deep:
                    deep:
                      var: value2
            `,
            );

            expect(processEntry).toBeCalledTimes(2);
            depends('vars', 'deep/deep/index.md', 'presets.yaml#default.deep.deep.var', false);
            depends('vars', 'deep/deep/index.md', 'deep/presets.yaml#default.deep.deep.var');

            await change(
                './presets.yaml',
                dedent`
                default:
                  var: value
            `,
            );

            expect(processEntry).toBeCalledTimes(2);
            depends('vars', 'deep/deep/index.md', 'presets.yaml#default.deep.deep.var', false);
            depends('vars', 'deep/deep/index.md', 'deep/presets.yaml#default.deep.deep.var');

            await change(
                './deep/presets.yaml',
                dedent`
                default:
                  var: value
            `,
            );

            expect(processEntry).toBeCalledTimes(3);
            depends('vars', 'deep/deep/index.md', 'missed#default.deep', true);
            depends('vars', 'deep/deep/index.md', 'presets.yaml#default.deep.deep.var', false);
            depends('vars', 'deep/deep/index.md', 'deep/presets.yaml#default.deep.deep.var', false);

            await change(
                './deep/presets.yaml',
                dedent`
                default:
                  deep:
                    deep:
                      var: value2
            `,
            );

            expect(processEntry).toBeCalledTimes(4);
            depends('vars', 'deep/deep/index.md', 'missed#default.deep', false);
            depends('vars', 'deep/deep/index.md', 'presets.yaml#default.deep.deep.var', false);
            depends('vars', 'deep/deep/index.md', 'deep/presets.yaml#default.deep.deep.var', true);
        });

        it('should handle deletion override in presets', async () => {
            expect(processEntry).not.toBeCalled();

            await register('./deep/deep/index.md', 'Title {{deep.deep.var}}');
            await create(
                './presets.yaml',
                dedent`
                default:
                  deep:
                    deep:
                      var: value
            `,
            );
            await create(
                './deep/presets.yaml',
                dedent`
                default:
                  deep:
                    deep:
                      var: value
            `,
            );
            await create(
                './deep/deep/presets.yaml',
                dedent`
                default:
                  deep:
                    deep:
                      var: value
            `,
            );
            await create('./toc.yaml', 'href: deep/deep/index.md');

            expect(processEntry).toBeCalledTimes(1);
            depends('vars', 'deep/deep/index.md', 'presets.yaml#default.deep.deep.var', false);
            depends('vars', 'deep/deep/index.md', 'deep/presets.yaml#default.deep.deep.var', false);
            depends(
                'vars',
                'deep/deep/index.md',
                'deep/deep/presets.yaml#default.deep.deep.var',
                true,
            );

            await change(
                './deep/deep/presets.yaml',
                dedent`
                default:
                  var: value
            `,
            );

            expect(processEntry).toBeCalledTimes(2);
            depends('vars', 'deep/deep/index.md', 'presets.yaml#default.deep.deep.var', false);
            depends('vars', 'deep/deep/index.md', 'deep/presets.yaml#default.deep.deep.var', true);
            depends(
                'vars',
                'deep/deep/index.md',
                'deep/deep/presets.yaml#default.deep.deep.var',
                false,
            );

            await change(
                './deep/presets.yaml',
                dedent`
                default:
                  var: value
            `,
            );

            expect(processEntry).toBeCalledTimes(3);
            depends('vars', 'deep/deep/index.md', 'presets.yaml#default.deep.deep.var', true);
            depends('vars', 'deep/deep/index.md', 'deep/presets.yaml#default.deep.deep.var', false);
            depends(
                'vars',
                'deep/deep/index.md',
                'deep/deep/presets.yaml#default.deep.deep.var',
                false,
            );
        });

        it('should handle configured scope change', async () => {
            expect(processEntry).not.toBeCalled();

            await register('./deep/deep/index.md', 'Title {{deep.deep.var}}');
            await create(
                './presets.yaml',
                dedent`
                    default:
                      deep:
                        deep:
                          var: value
                `,
            );
            await create(
                './deep/presets.yaml',
                dedent`
                    default:
                      deep:
                        deep:
                          var: value
                `,
            );
            await create(
                './deep/deep/presets.yaml',
                dedent`
                    default:
                      deep:
                        deep:
                          var: value
                `,
            );
            await create('./toc.yaml', 'href: deep/deep/index.md');

            expect(processEntry).toBeCalledTimes(1);
            depends('vars', 'deep/deep/index.md', 'presets.yaml#default.deep.deep.var', false);
            depends('vars', 'deep/deep/index.md', 'deep/presets.yaml#default.deep.deep.var', false);
            depends(
                'vars',
                'deep/deep/index.md',
                'deep/deep/presets.yaml#default.deep.deep.var',
                true,
            );
            depends(
                'vars',
                'deep/deep/index.md',
                'deep/deep/presets.yaml#internal.deep.deep.var',
                false,
            );

            await change(
                './deep/deep/presets.yaml',
                dedent`
                    default:
                      deep:
                        deep:
                          var: value
                    internal:
                      deep:
                        deep:
                          var: value
                `,
            );

            expect(processEntry).toBeCalledTimes(2);
            depends('vars', 'deep/deep/index.md', 'presets.yaml#default.deep.deep.var', false);
            depends('vars', 'deep/deep/index.md', 'deep/presets.yaml#default.deep.deep.var', false);
            depends(
                'vars',
                'deep/deep/index.md',
                'deep/deep/presets.yaml#default.deep.deep.var',
                false,
            );
            depends(
                'vars',
                'deep/deep/index.md',
                'deep/deep/presets.yaml#internal.deep.deep.var',
                true,
            );

            await change(
                './deep/deep/presets.yaml',
                dedent`
                    default:
                      deep:
                        deep:
                          var: value
                `,
            );

            expect(processEntry).toBeCalledTimes(3);
            depends('vars', 'deep/deep/index.md', 'presets.yaml#default.deep.deep.var', false);
            depends('vars', 'deep/deep/index.md', 'deep/presets.yaml#default.deep.deep.var', false);
            depends(
                'vars',
                'deep/deep/index.md',
                'deep/deep/presets.yaml#default.deep.deep.var',
                true,
            );
            depends(
                'vars',
                'deep/deep/index.md',
                'deep/deep/presets.yaml#internal.deep.deep.var',
                false,
            );
        });

        it('should handle simple presets remove', async () => {
            await register('./index.md', 'Title {{var}}');
            await create(
                './presets.yaml',
                dedent`
                    default:
                      var: value
                `,
            );
            await create('./toc.yaml', 'href: index.md');

            expect(processEntry).toBeCalledTimes(1);
            expect(processEntry).toBeCalledWith('index.md');
            hasNode('vars', 'presets.yaml', true);
            depends('vars', 'index.md', 'presets.yaml#default.var', true);

            await remove('./presets.yaml');

            expect(processEntry).toBeCalledTimes(2);
            hasNode('vars', 'presets.yaml', false);
            depends('vars', 'index.md', 'missed#default.var', true);
        });

        it('should handle useless presets remove', async () => {
            await register('./index.md', 'Title');
            await create(
                './presets.yaml',
                dedent`
                    default:
                      var: value
                `,
            );
            await create('./toc.yaml', 'href: index.md');

            expect(processEntry).toBeCalledTimes(1);
            expect(processEntry).toBeCalledWith('index.md');
            hasNode('vars', 'presets.yaml', true);
            depends('vars', 'index.md', 'missed#default.var', false);
            depends('vars', 'index.md', 'presets.yaml#default.var', false);

            await remove('./presets.yaml');

            expect(processEntry).toBeCalledTimes(1);
            hasNode('vars', 'presets.yaml', false);
            depends('vars', 'index.md', 'missed#default.var', false);
            depends('vars', 'index.md', 'presets.yaml#default.var', false);
        });

        it('should handle deep presets remove', async () => {
            await register('./deep/index.md', 'Title {{var}}');
            await create(
                './presets.yaml',
                dedent`
                    default:
                      var: value
                `,
            );
            await create(
                './deep/presets.yaml',
                dedent`
                    default:
                      var: value
                `,
            );
            await create('./toc.yaml', 'href: deep/index.md');

            expect(processEntry).toBeCalledTimes(1);
            expect(processEntry).toBeCalledWith('deep/index.md');
            hasNode('vars', 'presets.yaml', true);
            hasNode('vars', 'deep/presets.yaml', true);
            depends('vars', 'deep/index.md', 'deep/presets.yaml#default.var', true);

            await remove('./deep/presets.yaml');

            expect(processEntry).toBeCalledTimes(2);
            hasNode('vars', 'presets.yaml', true);
            hasNode('vars', 'deep/presets.yaml', false);
            depends('vars', 'deep/index.md', 'presets.yaml#default.var', true);
        });
    });

    describe('entry', () => {
        it('should handle entry update', async () => {
            expect(processEntry).not.toBeCalled();

            await register('./index.md', 'Title');
            await create('./toc.yaml', 'href: index.md');
            expect(processEntry).toBeCalledTimes(1);

            await change('./index.md', 'Title 2');
            expect(processEntry).toBeCalledTimes(2);
        });

        it('should handle entry include update', async () => {
            expect(processEntry).not.toBeCalled();

            await register('./index.md', '{% include [](./include1.md) %}');
            await register('./include1.md', 'Title 1');
            await register('./include2.md', 'Title 2');
            await create('./toc.yaml', 'href: index.md');
            expect(processEntry).toBeCalledTimes(1);

            await change('./include1.md', 'Title 3');
            expect(processEntry).toBeCalledTimes(2);

            await change('./include2.md', 'Title 3');
            expect(processEntry).toBeCalledTimes(2);
        });

        it('should not handle entry detached include update', async () => {
            expect(processEntry).not.toBeCalled();

            await register('./index.md', '{% include [](./include1.md) %}');
            await register('./include1.md', 'Title 1');
            await create('./toc.yaml', 'href: index.md');
            expect(processEntry).toBeCalledTimes(1);

            await change('./include1.md', 'Title 3');
            expect(processEntry).toBeCalledTimes(2);

            await change('./index.md', 'Title 3');
            expect(processEntry).toBeCalledTimes(3);

            await change('./include1.md', 'Title 4');
            expect(processEntry).toBeCalledTimes(3);
        });
    });
});

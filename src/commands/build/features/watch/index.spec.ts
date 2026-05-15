import type {Build} from '~/commands/build';
import type {RawToc} from '~/core/toc';
import type {MockInstance} from 'vitest';

import {join} from 'node:path';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {when} from 'vitest-when';
import {load} from 'js-yaml';
import {dedent} from 'ts-dedent';

import {getHooks as getTocHooks} from '~/core/toc';
import {normalizePath} from '~/core/utils';

import {run, runBuild, setupBuild} from '../../__tests__';

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
    class Defer<T> {
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
        promise = runBuild(
            args('-f', 'html', '--vars-preset', 'internal', '--allow-custom-resources'),
            build,
        );

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
        expect(
            run(build)[store].relations.hasNode(node),
            `Node ${node} exists in ${store} graph`,
        ).toBe(true);
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

        it('should handle asset change without releasing markdown includes', async () => {
            expect(processEntry).not.toBeCalled();

            await register('./index.md', '![alt](./image.png)\n{% include [](./include1.md) %}');
            await register('./include1.md', 'Title 1');
            await register('./image.png', 'binary-image-data');
            await create('./toc.yaml', 'href: index.md');
            expect(processEntry).toBeCalledTimes(1);

            // Check that image is properly tracked as asset
            hasNode('entry', 'index.md', true);
            hasNode('entry', 'image.png', true);
            hasNode('entry', 'include1.md', true);
            depends('entry', 'index.md', 'image.png', true);
            depends('entry', 'index.md', 'include1.md', true);
            nodeData('entry', 'image.png', {type: 'resource'});

            // Mock the release method to verify it's not called for assets
            const releaseIncludeSpy = vi.spyOn(run(build).entry, 'release');

            await change('./image.png', 'updated-binary-image-data');

            // Entry should be reprocessed when asset changes
            expect(processEntry).toBeCalledTimes(2);
            expect(processEntry).toHaveBeenLastCalledWith('index.md');

            // Verify that release was not called for asset files
            // (because isAssetChange check should prevent this)
            expect(releaseIncludeSpy).not.toHaveBeenCalledWith('image.png', 'index.md');
        });

        it('should handle multiple asset types', async () => {
            expect(processEntry).not.toBeCalled();

            await register(
                './index.md',
                dedent`
                ---
                script:
                  - test.js
                style:
                  - test.css
                ---
                # Title
                ![png](./image.png)
                ![jpg](./photo.jpg)
                ![svg](./icon.svg)
                ![webp](./modern.webp)
            `,
            );
            await register('./image.png', 'png-data');
            await register('./photo.jpg', 'jpg-data');
            await register('./icon.svg', '<svg></svg>');
            await register('./modern.webp', 'webp-data');
            await register('./test.js', 'js-data');
            await register('./test.css', 'css-data');
            await create('./toc.yaml', 'href: index.md');
            expect(processEntry).toBeCalledTimes(1);

            // Verify all assets are tracked
            hasNode('entry', 'index.md', true);
            hasNode('entry', 'image.png', true);
            hasNode('entry', 'photo.jpg', true);
            hasNode('entry', 'icon.svg', true);
            hasNode('entry', 'modern.webp', true);

            depends('entry', 'index.md', 'image.png', true);
            depends('entry', 'index.md', 'photo.jpg', true);
            depends('entry', 'index.md', 'icon.svg', true);
            depends('entry', 'index.md', 'modern.webp', true);

            nodeData('entry', 'image.png', {type: 'resource'});
            nodeData('entry', 'photo.jpg', {type: 'resource'});
            nodeData('entry', 'icon.svg', {type: 'resource'});
            nodeData('entry', 'modern.webp', {type: 'resource'});
            nodeData('entry', 'test.js', {type: 'resource'});
            nodeData('entry', 'test.css', {type: 'resource'});

            // Change each asset and verify entry is reprocessed
            await change('./image.png', 'updated-png-data');
            expect(processEntry).toBeCalledTimes(2);

            await change('./photo.jpg', 'updated-jpg-data');
            expect(processEntry).toBeCalledTimes(3);

            await change('./icon.svg', '<svg><circle/></svg>');
            expect(processEntry).toBeCalledTimes(4);

            await change('./modern.webp', 'updated-webp-data');
            expect(processEntry).toBeCalledTimes(5);
        });

        it('should handle asset removal', async () => {
            expect(processEntry).not.toBeCalled();

            await register('./index.md', '![alt](./image.png)');
            await register('./image.png', 'binary-data');
            await create('./toc.yaml', 'href: index.md');
            expect(processEntry).toBeCalledTimes(1);

            hasNode('entry', 'index.md', true);
            hasNode('entry', 'image.png', true);
            depends('entry', 'index.md', 'image.png', true);

            await remove('./image.png');

            // Entry should be reprocessed when asset is removed
            expect(processEntry).toBeCalledTimes(2);
            expect(processEntry).toHaveBeenLastCalledWith('index.md');
        });

        it('should differentiate between asset and markdown file changes', async () => {
            expect(processEntry).not.toBeCalled();

            await register(
                './index.md',
                dedent`
                ![alt](./image.png)
                {% include [](./include.md) %}
            `,
            );
            await register('./image.png', 'binary-data');
            await register('./include.md', 'Include content');
            await create('./toc.yaml', 'href: index.md');
            expect(processEntry).toBeCalledTimes(1);

            // Verify both dependencies exist with correct types
            hasNode('entry', 'index.md', true);
            hasNode('entry', 'image.png', true);
            hasNode('entry', 'include.md', true);
            nodeData('entry', 'image.png', {type: 'resource'});

            const releaseIncludeSpy = vi.spyOn(run(build).entry, 'release');

            // Change asset - should not release includes
            await change('./image.png', 'updated-binary-data');
            expect(processEntry).toBeCalledTimes(2);
            expect(releaseIncludeSpy).not.toHaveBeenCalledWith('image.png', 'index.md');

            // Change markdown include - should release includes normally
            await change('./include.md', 'Updated include content');
            expect(processEntry).toBeCalledTimes(3);
            expect(releaseIncludeSpy).toHaveBeenCalledWith('include.md', 'index.md');
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

        it('should handle YAML page with resources', async () => {
            expect(processEntry).not.toBeCalled();

            await register(
                './index.yaml',
                dedent`
                meta:
                  script:
                    - main.js
                    - analytics.js
                  style:
                    - theme.css
                    - custom.css
                links: []
            `,
            );
            await register('./main.js', 'console.log("main");');
            await register('./analytics.js', 'console.log("analytics");');
            await register('./theme.css', 'body { color: red; }');
            await register('./custom.css', 'body { font-size: 16px; }');
            await create('./toc.yaml', 'href: index.yaml');
            expect(processEntry).toBeCalledTimes(1);

            // Verify all resources are tracked
            hasNode('entry', 'index.yaml', true);
            hasNode('entry', 'main.js', true);
            hasNode('entry', 'analytics.js', true);
            hasNode('entry', 'theme.css', true);
            hasNode('entry', 'custom.css', true);

            depends('entry', 'index.yaml', 'main.js', true);
            depends('entry', 'index.yaml', 'analytics.js', true);
            depends('entry', 'index.yaml', 'theme.css', true);
            depends('entry', 'index.yaml', 'custom.css', true);

            nodeData('entry', 'main.js', {type: 'resource'});
            nodeData('entry', 'analytics.js', {type: 'resource'});
            nodeData('entry', 'theme.css', {type: 'resource'});
            nodeData('entry', 'custom.css', {type: 'resource'});

            // Change each resource and verify entry is reprocessed
            await change('./main.js', 'console.log("updated main");');
            expect(processEntry).toBeCalledTimes(2);

            await change('./analytics.js', 'console.log("updated analytics");');
            expect(processEntry).toBeCalledTimes(3);

            await change('./theme.css', 'body { color: blue; }');
            expect(processEntry).toBeCalledTimes(4);

            await change('./custom.css', 'body { font-size: 18px; }');
            expect(processEntry).toBeCalledTimes(5);
        });

        it('should handle YAML page with mixed resources and images', async () => {
            expect(processEntry).not.toBeCalled();

            await register(
                './index.yaml',
                dedent`
                meta:
                  script:
                    - app.js
                  style:
                    - styles.css
                links:
                  - title: "Page with image"
                    href: "page.md"
            `,
            );
            await register('./app.js', 'const app = {};');
            await register('./styles.css', '.container { margin: 0; }');
            await create('./toc.yaml', 'href: index.yaml');
            expect(processEntry).toBeCalledTimes(1);

            // Verify all resources and images are tracked
            hasNode('entry', 'index.yaml', true);
            hasNode('entry', 'app.js', true);
            hasNode('entry', 'styles.css', true);

            depends('entry', 'index.yaml', 'app.js', true);
            depends('entry', 'index.yaml', 'styles.css', true);

            nodeData('entry', 'app.js', {type: 'resource'});
            nodeData('entry', 'styles.css', {type: 'resource'});

            const releaseIncludeSpy = vi.spyOn(run(build).entry, 'release');

            // Change YAML resources - should not release includes
            await change('./app.js', 'const app = { version: "1.0" };');
            expect(processEntry).toBeCalledTimes(2);
            expect(releaseIncludeSpy).not.toHaveBeenCalledWith('app.js', 'index.yaml');

            await change('./styles.css', '.container { margin: 10px; }');
            expect(processEntry).toBeCalledTimes(3);
            expect(releaseIncludeSpy).not.toHaveBeenCalledWith('styles.css', 'index.yaml');
        });

        it('should handle YAML page resource removal', async () => {
            expect(processEntry).not.toBeCalled();

            await register(
                './index.yaml',
                dedent`
                meta:
                  script:
                    - old.js
                  style:
                    - old.css
                links: []
            `,
            );
            await register('./old.js', 'console.log("old");');
            await register('./old.css', 'body { old: true; }');
            await create('./toc.yaml', 'href: index.yaml');
            expect(processEntry).toBeCalledTimes(1);

            hasNode('entry', 'index.yaml', true);
            hasNode('entry', 'old.js', true);
            hasNode('entry', 'old.css', true);

            // Remove script resource
            await remove('./old.js');
            expect(processEntry).toBeCalledTimes(2);
            expect(processEntry).toHaveBeenLastCalledWith('index.yaml');

            // Remove style resource
            await remove('./old.css');
            expect(processEntry).toBeCalledTimes(3);
            expect(processEntry).toHaveBeenLastCalledWith('index.yaml');
        });
    });
});

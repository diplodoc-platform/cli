import type {Server, ServerResponse} from 'node:http';
import type {FileChangeInfo} from 'node:fs/promises';
import type {Build, Run} from '~/commands/build';
import type {Preset} from '~/core/vars';
import type {Command} from '~/core/config';
import type {EntryTocItem, Toc} from '~/core/toc';

import {dirname, join} from 'node:path';
import {watch} from 'node:fs/promises';
import {createServer} from 'node:http';

import {getEntryHooks} from '~/commands/build';
import {getHooks as getBaseHooks} from '~/core/program';
import {defined} from '~/core/config';
import {bounded, compareJson, normalizePath} from '~/core/utils';

import {options} from './config';
import * as threads from '~/commands/threads';

export type WatchArgs = {
    watch: boolean;
};

export type WatchConfig = {
    watch: boolean;
};

class Watcher {
    readonly events: AsyncIterable<FileChangeInfo<string>>;

    readonly changed = new Set<NormalizedPath>();

    readonly invalide = new Set<NormalizedPath>();

    readonly run: Run;

    readonly logger: Run['logger'];

    private program: Build;

    constructor(program: Build, run: Run) {
        this.program = program;
        this.run = run;
        this.logger = run.logger;
        this.events = watch(run.originalInput, {
            recursive: true,
        });
    }

    eventType(file: NormalizedPath, event: FileChangeInfo<string>) {
        const input = normalizePath(join(this.run.originalInput, file)) as AbsolutePath;

        if (event.eventType === 'rename') {
            return this.run.exists(input) ? 'add' : 'remove';
        }

        if (event.eventType === 'change') {
            return 'change';
        }

        return event.eventType;
    }

    @bounded invalidate(path: NormalizedPath) {
        this.invalide.add(path);
    }

    processToc(...args: Parameters<Build['processToc']>) {
        return this.program.processToc(...args);
    }

    processEntry(...args: Parameters<Build['processEntry']>) {
        return this.program.processEntry(...args);
    }

    @bounded isKnownEntry(path: NormalizedPath) {
        if (!this.isGraphPart('toc', path)) {
            return false;
        }

        const data = this.run.toc.relations.getNodeData(path);
        return data?.type === 'entry';
    }

    @bounded isKnownToc(path: NormalizedPath) {
        if (!this.isGraphPart('toc', path)) {
            return false;
        }

        const data = this.run.toc.relations.getNodeData(path);
        return data?.type === 'toc';
    }

    @bounded isToc(path: NormalizedPath) {
        return Boolean(path.match(/(^|\/|\\)toc.yaml$/));
    }

    @bounded isPreset(path: NormalizedPath) {
        return Boolean(path.match(/(^|\/|\\)presets.yaml$/));
    }

    isGraphPart(graph: 'toc' | 'vars' | 'entry', node: NormalizedPath) {
        return this.run[graph].relations.hasNode(node);
    }

    getParents(graph: 'toc' | 'vars' | 'entry', node: NormalizedPath) {
        const store = this.run[graph].relations;
        if (!store.hasNode(node)) {
            return [];
        }

        return store.dependantsOf(node) as NormalizedPath[];
    }

    getChilds(graph: 'toc' | 'vars' | 'entry', node: NormalizedPath) {
        const store = this.run[graph].relations;
        if (!store.hasNode(node)) {
            return [];
        }

        return store.dependenciesOf(node);
    }

    async getEntries(paths: (NormalizedPath | Toc)[]) {
        const tocs = paths.map((toc) => {
            if (typeof toc === 'string') {
                return this.run.toc.for(toc);
            }

            return toc;
        });
        const entries = new Set<NormalizedPath>();

        for (const toc of tocs) {
            await this.run.toc.walkEntries([toc as unknown as EntryTocItem], (item) => {
                entries.add(normalizePath(join(dirname(toc.path), item.href)));

                return item;
            });
        }

        return [...entries];
    }
}

export class Watch {
    private server!: Server;

    private channels: Hash<ServerResponse> = {};

    apply(program: Build) {
        this.server = createServer((req, res) => {
            const url = new URL('http://localhost' + req.url);

            if (url.pathname === '/update') {
                res.writeHead(200, {
                    'Content-Type': 'text/event-stream',
                    'Access-Control-Allow-Origin': '*',
                });

                const page = url.searchParams.get('page') as string;

                res.on('end', () => {
                    delete this.channels[page];
                });

                this.channels[page] = res;
            } else {
                res.writeHead(404, {
                    'Content-Type': 'text/plain',
                });
                res.end('Not found');
            }
        });

        getBaseHooks(program).Command.tap('Watch', (command: Command) => {
            command.addOption(options.watch);
        });

        getBaseHooks(program).Config.tap('Watch', (config, args) => {
            config.watch = defined('watch', args, config) || false;

            return config;
        });

        getBaseHooks<Run>(program).BeforeAnyRun.tap('Watch', (run) => {
            if (!run.config.watch) {
                return;
            }

            getEntryHooks(run.entry).Page.tap('Watch', (template) => {
                template.addCsp({
                    'connect-src': ['http://localhost:3000'],
                });
                template.addScript(
                    `
                    const source = new EventSource('http://localhost:3000/update?page=${template.path}');

                    source.onmessage = function(event) {
                        if (event.data === '${template.path}') {
                            window.location.reload();
                        }
                    }
                `,
                    {inline: true},
                );
            });
        });

        getBaseHooks<Run>(program).AfterAnyRun.tapPromise(
            {name: 'Watch', stage: Infinity},
            async (run) => {
                if (!run.config.watch) {
                    return;
                }

                const socket = this.server.listen(3000);
                const watch = new Watcher(program, run);

                watch.logger.info('Watching for changes...');

                await threads.terminate();

                for await (const event of watch.events) {
                    const file = normalizePath(event.filename as string);
                    const origin = normalizePath(join(run.originalInput, file)) as AbsolutePath;
                    const input = normalizePath(join(run.input, file)) as AbsolutePath;

                    try {
                        watch.changed.add(file);

                        switch (watch.eventType(file, event)) {
                            case 'add':
                            case 'change':
                                await run.copy(origin, input);
                                await this.handleChange(watch);
                                break;
                            case 'remove':
                                await run.remove(input);
                                await this.handleChange(watch, {hasNewContent: false});
                                break;
                            default:
                                throw new TypeError('Unknown fs event');
                        }
                    } catch (error) {
                        watch.logger.error(error);
                    }
                }

                socket.close();
            },
        );
    }

    private async handleChange(watch: Watcher, {hasNewContent = true} = {}) {
        for (const file of watch.changed) {
            watch.changed.delete(file);

            const isTocGraphPart = watch.isGraphPart('toc', file);
            const isEntryGraphPart = watch.isGraphPart('entry', file);
            const isVarsGraphPart = watch.isGraphPart('vars', file);
            const isGraphPart = isTocGraphPart || isEntryGraphPart || isVarsGraphPart;

            // New file was added.
            // Some kind of new files should be handled.
            if (!isGraphPart) {
                if (watch.isToc(file)) {
                    const tocs = await watch.run.toc.init([file]);
                    for (const toc of tocs) {
                        await watch.processToc(toc);
                    }

                    const entries = await watch.getEntries(tocs);
                    for (const entry of entries) {
                        await watch.processEntry(entry);
                    }
                }

                if (watch.isPreset(file)) {
                    await this.handleChangeVars(file, watch);
                }
            }

            if (isVarsGraphPart) {
                await this.handleChangeVars(file, watch, {hasNewContent});
            }

            if (isTocGraphPart) {
                await this.handleChangeToc(file, watch, {hasNewContent});
            }

            if (isEntryGraphPart) {
                await this.handleChangeEntry(file, watch, {hasNewContent});
            }

            if (watch.invalide.size) {
                const tocs = [...watch.invalide].filter(watch.isKnownToc);
                for (const toc of tocs) {
                    watch.invalide.delete(toc);
                    await watch.processToc(watch.run.toc.for(toc)).catch(watch.logger.error);
                }

                const entries = [...watch.invalide].filter(watch.isKnownEntry);
                for (const entry of entries) {
                    watch.invalide.delete(entry);
                    await watch.processEntry(entry).catch(watch.logger.error);
                }

                for (const other of watch.invalide) {
                    watch.invalide.delete(other);
                }
            }

            // Only first changed file can be handled as removed
            hasNewContent = true;
        }

        this.update();
    }

    private async handleChangeVars(
        file: NormalizedPath,
        watch: Watcher,
        {hasNewContent = true} = {},
    ) {
        watch.logger.info('Handle vars graph change for', file);

        if (!watch.isPreset(file)) {
            watch.run.vars.relations.release(file);
            return;
        }

        const prev = watch.run.vars.get(file) || {};
        // When we handle removed preset, we handle at first step this preset as empty file.
        const [next] = hasNewContent ? ((await watch.run.vars.init([file])) as Preset[]) : [{}];

        const diff = compareJson(prev, next);

        const changed = watch.run.vars.getAffectedFiles(file, diff.changed);
        const specified = watch.run.vars.getSpecifiedFiles(file, diff.added, diff.removed);
        for (const file of [...changed, ...specified]) {
            watch.changed.add(file as NormalizedPath);
        }

        // When we handle removed preset, at second step we remove it from vars graph
        if (!hasNewContent) {
            watch.run.vars.relations.release(file);
        }
    }

    private async handleChangeToc(
        file: NormalizedPath,
        watch: Watcher,
        {hasNewContent = true} = {},
    ) {
        watch.logger.info('Handle toc graph change for', file);

        const isExistedToc = (path: NormalizedPath) => path !== file || hasNewContent;

        // Touched files can be toc or some toc part (like include).
        const oldFiles = [file, ...watch.getParents('toc', file)] as NormalizedPath[];
        // This is a list of toc parts.
        // We need to compare list of deps after tocs update and react on diff.
        const oldDeps = watch.getChilds('toc', file) as NormalizedPath[];
        // This is a list of tocs which should be updated.
        const oldTocsPaths = oldFiles.filter(watch.isKnownToc);
        const oldEntries = await watch.getEntries(oldTocsPaths);

        // Drop cache for all related files.
        for (const file of oldFiles) {
            watch.run.toc.release(file);
        }

        for (const file of oldTocsPaths) {
            watch.run.toc.relations.release(file);
        }

        // Reinit touched tocs after cache drop.
        // Do not reinit removed toc.
        await this.reinitTocs(watch, oldTocsPaths.filter(isExistedToc));

        // List of updated deps. Now we can compare it with old deps list.
        const newDeps = hasNewContent ? (watch.getChilds('toc', file) as NormalizedPath[]) : [];
        const depsDiff = diff(oldDeps, newDeps);
        // On compare we search for previously detached toc includes, which name match toc.yaml
        // This detached toc.yaml now possibly transforms to true tocs.
        const detachedTocsPaths = depsDiff.removed.filter(
            (dep) => watch.isToc(dep) && !watch.isGraphPart('toc', dep),
        );
        // Reinit detached toc.yaml to transform them.
        await this.reinitTocs(watch, detachedTocsPaths);

        const newTocsPaths = [file, ...detachedTocsPaths, ...watch.getParents('toc', file)]
            .filter(watch.isKnownToc)
            .filter(isExistedToc);
        const newEntries = await watch.getEntries(newTocsPaths);

        const entriesDiff = diff(oldEntries, newEntries);

        // Update added to toc entries
        // because path for this entries can be changed.
        for (const entry of entriesDiff.added) {
            watch.invalidate(entry);
        }

        // Update removed from toc entries.
        // Toc path for this entries can be changed.
        for (const entry of entriesDiff.removed) {
            // If entry is not attached to any toc, then we don't need to process it.
            if (!watch.isGraphPart('toc', entry)) {
                watch.run.entry.relations.release(entry);
                continue;
            }

            // If entry is not exists on graph, then it can't be affected by toc change.
            if (!watch.isGraphPart('entry', entry)) {
                continue;
            }

            watch.invalidate(entry);
        }
    }

    private async reinitTocs(watch: Watcher, tocs: NormalizedPath[]) {
        for (const toc of tocs) {
            try {
                await watch.run.toc.init([toc]);
                watch.invalidate(toc);
            } catch (error) {
                watch.logger.error(error);
            }
        }
    }

    private async handleChangeEntry(
        file: NormalizedPath,
        watch: Watcher,
        {hasNewContent = true} = {},
    ) {
        watch.logger.info('Handle entry graph change for', file);

        const isExistedEntry = (path: NormalizedPath) => path !== file || hasNewContent;

        const files = [file, ...watch.getParents('entry', file)] as NormalizedPath[];
        const entries = files.filter(watch.isKnownEntry);

        for (const entry of entries) {
            for (const file of files) {
                if (!watch.isKnownEntry(file)) {
                    // Release all includes relative to target entry
                    watch.run.entry.release(file, entry);
                }
            }
            watch.run.entry.release(entry);
            watch.run.entry.relations.release(entry);

            if (isExistedEntry(entry)) {
                watch.invalidate(entry);
            }
        }
    }

    private update(entry?: string) {
        if (!entry) {
            for (const [entry, channel] of Object.entries(this.channels)) {
                channel.write('data: ' + entry + '\n\n');
            }
        } else if (this.channels[entry]) {
            this.channels[entry].write('data: ' + entry + '\n\n');
        }
    }
}

function diff(a: NormalizedPath[], b: NormalizedPath[]) {
    const removed = [];
    const added = [];

    const paths = new Set([...a, ...b]);
    for (const path of paths) {
        const aMemeber = a.includes(path);
        const bMemeber = b.includes(path);

        if (aMemeber && !bMemeber) {
            removed.push(path);
        }

        if (!aMemeber && bMemeber) {
            added.push(path);
        }
    }

    return {added, removed};
}

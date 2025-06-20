import {Build, Run, getEntryHooks} from '~/commands/build';
import type {Command} from '~/core/config';
import type {EntryTocItem, Toc} from '~/core/toc';

import {dirname, join} from 'node:path';
import {watch} from 'node:fs/promises';
import express, {Application, Response} from 'express';

import {getHooks as getBaseHooks} from '~/core/program';
import {defined} from '~/core/config';
import {normalizePath} from '~/core/utils';

import {options} from './config';

export type WatchArgs = {
    watch: boolean;
};

export type WatchConfig = {
    watch: boolean;
};

type WatchState = {
    isEntry(path: NormalizedPath): boolean;
    isToc(path: NormalizedPath): boolean;
};

const not = (fn: (path: NormalizedPath) => boolean) => (path: NormalizedPath) => !fn(path);

const anyOf =
    (...fns: ((path: NormalizedPath) => boolean)[]) =>
    (path: NormalizedPath) =>
        fns.some((fn) => fn(path));

export class Watch {
    private server!: Application;

    private channels: Hash<Response> = {};

    apply(program: Build) {
        this.server = express();
        this.server.get('/update', (req, res) => {
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.flushHeaders();

            const page = req.query.page as string;

            res.on('end', () => {
                delete this.channels[page];
            });

            this.channels[page] = res;
        });

        getBaseHooks(program).Command.tap('Watch', (command: Command) => {
            command.addOption(options.watch);
        });

        getBaseHooks(program).Config.tap('Watch', (config, args) => {
            config.watch = defined('watch', args, config) || false;

            return config;
        });

        getBaseHooks<Run>(program).BeforeAnyRun.tap('Watch', (run) => {
            getEntryHooks(run.entry).Page.tap('Watch', (template) => {
                template.addCsp({
                    'connect-src': ['http://localhost:3000'],
                });
                template.addScript(
                    `
                    const source = new EventSource('http://localhost:3000/update?page=${template.path}');

                    source.onmessage = function(event) {
                        console.log(data);
                        if (event.data === '${template.path}') {
                            window.location.reload();
                        }
                    }
                `,
                    {inline: true},
                );
            });
        });

        getBaseHooks<Run>(program).AfterAnyRun.tapPromise('Watch', async (run) => {
            if (!run.config.watch) {
                return;
            }

            this.server.listen(3000);

            console.log('Watching for changes...');

            const isEntry = (path: NormalizedPath) => {
                const data = run.entry.graph.getNodeData(path);
                return data?.type === 'entry';
            };
            const isToc = (path: NormalizedPath) => {
                const data = run.entry.graph.getNodeData(path);
                return data?.type === 'toc';
            };
            const watchState: WatchState = {
                isEntry,
                isToc,
            };

            const iterator = watch(run.originalInput, {
                recursive: true,
            });

            for await (const change of iterator) {
                if (change.eventType === 'change') {
                    await this.handleChange(
                        program,
                        run,
                        normalizePath(change.filename as string),
                        watchState,
                    );
                }
            }
        });
    }

    private async handleChange(program: Build, run: Run, file: NormalizedPath, state: WatchState) {
        if (!run.toc.graph.hasNode(file) && !run.entry.graph.hasNode(file)) {
            return;
        }

        await run.copy(join(run.originalInput, file), join(run.input, file));

        if (run.toc.graph.hasNode(file)) {
            console.log('Handle toc change');
            await this.handleChangeToc(program, run, file, state);
        }

        if (run.entry.graph.hasNode(file) && !state.isToc(file)) {
            console.log('Handle entry change');
            await this.handleChangeEntry(program, run, file, state);
        }
    }

    private async handleChangeToc(
        program: Build,
        run: Run,
        file: NormalizedPath,
        state: WatchState,
    ) {
        const oldFiles = [file, ...run.toc.graph.dependentsOf(file)] as NormalizedPath[];
        const oldDeps = run.toc.graph.dependenciesOf(file) as NormalizedPath[];
        const oldTocsPaths = oldFiles.filter(state.isToc);
        const oldTocs = oldTocsPaths.map(run.toc.for);
        const oldEntries = await getEntries(run, oldTocs);

        run.toc.graph.releaseDependencies(file);
        for (const file of oldFiles) {
            run.toc.release(file);
        }

        const tocs = await run.toc.init(oldTocsPaths);
        for (const toc of tocs) {
            await program.processToc(toc);
        }

        const newDeps = run.toc.graph.dependenciesOf(file) as NormalizedPath[];
        const depsDiff = diff(oldDeps, newDeps);
        const detachedTocsPaths = depsDiff.removed.filter(
            (dep) => dep.match(/\/toc.yaml$/) && !run.toc.graph.hasNode(dep),
        );
        const detachedTocs = detachedTocsPaths.map(run.toc.for);
        if (detachedTocs.length) {
            const tocs = await run.toc.init(detachedTocsPaths);
            for (const toc of tocs) {
                await program.processToc(toc);
            }
        }

        const newFiles = [file, ...run.toc.graph.dependentsOf(file)] as NormalizedPath[];
        const newTocsPaths = newFiles.filter(state.isToc);
        const newTocs = newTocsPaths.map(run.toc.for);
        const newEntries = await getEntries(run, newTocs.concat(detachedTocs));

        const entriesDiff = diff(oldEntries, newEntries);

        // Update added to toc entries
        // because path for this entries can be changed.
        for (const entry of entriesDiff.added) {
            // We need to process only existed entries.
            // Entry can be written to toc before of creating on fs.
            const existsOriginal = run.exists(join(run.originalInput, entry));
            const exists = run.exists(join(run.input, entry));
            if (!existsOriginal && !exists) {
                continue;
            }

            // Entry can be generated by includer.
            // In this case we don't need to try to copy it from origin.
            if (existsOriginal && !exists) {
                await run.copy(join(run.originalInput, entry), join(run.input, entry));
            }

            const meta = run.meta.get(entry);
            const info = await program.process(entry, meta);

            run.entry.graph.consume(info.graph);
        }

        // Update added to toc entries.
        // Toc path for this entries can be changed.
        for (const entry of entriesDiff.removed) {
            // We need to process only existed entries.
            // Entry can be written to toc before of creating on fs.
            const existsOriginal = run.exists(join(run.originalInput, entry));
            const exists = run.exists(join(run.input, entry));
            if (!existsOriginal && !exists) {
                continue;
            }

            // If entry is not exists on graph, then it can't be affected by toc change.
            if (!run.entry.graph.hasNode(entry)) {
                continue;
            }

            // If entry is not attached to any toc, then we don't need to process it.
            try {
                run.toc.for(entry);
            } catch {
                continue;
            }

            const meta = run.meta.get(entry);
            const info = await program.process(entry, meta);

            run.entry.graph.consume(info.graph);
        }

        this.update();
    }

    private async handleChangeEntry(
        program: Build,
        run: Run,
        file: NormalizedPath,
        state: WatchState,
    ) {
        const files = [file, ...run.entry.graph.dependentsOf(file)] as NormalizedPath[];
        const entries = files.filter(state.isEntry);
        const rest = files.filter(not(anyOf(state.isEntry, state.isToc)));

        run.entry.graph.releaseDependencies(file);

        console.log('Changed entries parts', rest);
        for (const file of rest) {
            for (const entry of entries) {
                run.entry.release(file, entry);
            }
        }

        console.log('Changed entries', entries);
        for (const entry of entries) {
            run.entry.release(file);
            await program.processEntry(entry);
            this.update(entry);
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

async function getEntries(run: Run, tocs: Toc[]) {
    const entries = new Set<NormalizedPath>();

    for (const toc of tocs) {
        await run.toc.walkEntries([toc as unknown as EntryTocItem], (item) => {
            entries.add(normalizePath(join(dirname(toc.path), item.href)));

            return item;
        });
    }

    return [...entries];
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

import type {Server, ServerResponse} from 'node:http';
import type {Build, Run} from '~/commands/build';
import type {Preset} from '~/core/vars';
import type {Command} from '~/core/config';

import {join} from 'node:path';
import {createServer} from 'node:http';

import {MAIN_TIMER_ID} from '~/constants';
import {getEntryHooks} from '~/commands/build';
import {getHooks as getBaseHooks} from '~/core/program';
import {defined} from '~/core/config';
import {PageAudienceConflictError, resolveLlmsConfig} from '~/core/toc';
import {compareJson, console, normalizePath, setExt} from '~/core/utils';
import * as threads from '~/commands/threads';

import {OutputFormat} from '../../config';

import {options} from './config';
import {Watcher} from './Watcher';
import {WatchState} from './WatchState';

export type WatchArgs = {
    watch: boolean;
};

export type WatchConfig = {
    watch: boolean;
};

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

                if (process.env.NODE_ENV !== 'test') {
                    // eslint-disable-next-line no-console
                    console.timeEnd(MAIN_TIMER_ID);
                }

                const socket = this.server.listen(3000);
                const watch = new Watcher(run);
                const state = new WatchState(program, run);

                console.log('Watching for changes...');

                await threads.terminate();

                for await (const {file, type} of watch.events) {
                    const origin = normalizePath(join(run.originalInput, file)) as AbsolutePath;
                    const input = normalizePath(join(run.input, file)) as AbsolutePath;

                    try {
                        switch (type) {
                            case 'add':
                            case 'change':
                                await run.copy(origin, input);
                                await this.handleChange(state, file);
                                break;
                            case 'unlink':
                                await run.remove(input);
                                await this.handleChange(state, file, false);
                                break;
                        }
                    } catch (error) {
                        console.log(error);
                        state.logger.error(error);
                    }
                }

                socket.close();
            },
        );
    }

    private async handleChange(state: WatchState, file: NormalizedPath, hasNewContent = true) {
        // Try the latest edit first: it may resolve the conflict blocking older events.
        let next: [NormalizedPath, boolean] | undefined = [file, hasNewContent];
        while (next) {
            const [path, exists] = next;
            state.changed.delete(path);
            try {
                await this.processChange(state, path, exists);
            } catch (error) {
                if (error instanceof PageAudienceConflictError) {
                    state.changed.set(path, exists);
                }
                throw error;
            }
            state.processedFiles.add(path);
            next = state.changed.entries().next().value;
        }

        await state.complete();
        this.update();
    }

    private async processChange(state: WatchState, file: NormalizedPath, hasNewContent: boolean) {
        const isTocGraphPart = state.isGraphPart('toc', file);
        const isEntryGraphPart = state.isGraphPart('entry', file);
        const isDetachedEntryGraphPart = state.isGraphPart('detached', file);
        const isVarsGraphPart = state.isGraphPart('vars', file);
        const isGraphPart =
            isTocGraphPart || isEntryGraphPart || isDetachedEntryGraphPart || isVarsGraphPart;

        // New file was added.
        // Some kind of new files should be handled.
        if (!isGraphPart) {
            if (state.isToc(file)) {
                const tocs = await state.run.toc.init([file]);
                for (const toc of tocs) {
                    await state.processToc(toc);
                }

                const entries = await state.getEntries(tocs);
                for (const entry of entries) {
                    await state.processEntry(entry);
                }
            }

            if (state.isPreset(file)) {
                await this.handleChangeVars(file, state);
            }
        }

        if (isVarsGraphPart) {
            await this.handleChangeVars(file, state, {hasNewContent});
        }

        if (isTocGraphPart) {
            await this.handleChangeToc(file, state, {hasNewContent});
        }

        // Only a TOC edit can recover an invalid audience graph. Defer other files
        // before publishing any pending output or completing this batch.
        state.run.toc.getPageAudiences();

        if (isEntryGraphPart) {
            await this.handleChangeEntry(file, state, {hasNewContent});
        }

        if (isDetachedEntryGraphPart) {
            await this.handleChangeDetachedEntry(file, state, {hasNewContent});
        }

        await this.rebuildInvalidated(state);
    }

    private async rebuildInvalidated(state: WatchState) {
        if (!state.invalide.size) {
            return;
        }

        const tocs = [...state.invalide].filter(state.isKnownToc);
        for (const toc of tocs) {
            state.invalide.delete(toc);
            await state.processToc(state.run.toc.for(toc)).catch(state.logger.error);
        }

        const entries = [...state.invalide].filter(state.isKnownEntry);
        for (const entry of entries) {
            state.invalide.delete(entry);
            await state.processEntry(entry).catch(state.logger.error);
        }

        state.invalide.clear();
    }

    private async handleChangeVars(
        file: NormalizedPath,
        state: WatchState,
        {hasNewContent = true} = {},
    ) {
        state.logger.info('Handle vars graph change for', file);

        if (!state.isPreset(file)) {
            state.run.vars.relations.release(file);
            return;
        }

        const prev = state.run.vars.get(file) || {};
        // When we handle removed preset, we handle at first step this preset as empty file.
        const [next] = hasNewContent ? ((await state.run.vars.init([file])) as Preset[]) : [{}];

        const diff = compareJson(prev, next);

        const changed = state.run.vars.getAffectedFiles(file, diff.changed);
        const specified = state.run.vars.getSpecifiedFiles(file, diff.added, diff.removed);
        for (const file of [...changed, ...specified]) {
            state.changed.set(file as NormalizedPath, true);
        }

        // When we handle removed preset, at second step we remove it from vars graph
        if (!hasNewContent) {
            state.run.vars.relations.release(file);
        }
    }

    private async handleChangeToc(
        file: NormalizedPath,
        state: WatchState,
        {hasNewContent = true} = {},
    ) {
        state.logger.info('Handle toc graph change for', file);

        const isExistedToc = (path: NormalizedPath) => path !== file || hasNewContent;
        const isGenerator = state.isKnownTocGenerator(file);

        // Touched files can be toc or some toc part (like include).
        const oldFiles = [file, ...state.getParents('toc', file)] as NormalizedPath[];
        // This is a list of toc parts.
        // We need to compare list of deps after tocs update and react on diff.
        const oldDeps = state.getChilds('toc', file) as NormalizedPath[];
        // This is a list of tocs which should be updated.
        const oldTocsPaths = oldFiles.filter(state.isKnownToc);
        oldTocsPaths.forEach((path) => state.affectedTocs.add(path));
        const oldEntries = await state.getEntries(oldTocsPaths);
        const getLlmsUrl = (path: NormalizedPath) =>
            resolveLlmsConfig(state.run.config.llms, state.run.toc.for(path)).url || '';
        const oldLlmsUrls = new Map(oldTocsPaths.map((path) => [path, getLlmsUrl(path)]));

        // Drop cache for all related files.
        for (const file of oldFiles) {
            state.run.toc.release(file);
        }

        for (const file of oldTocsPaths) {
            state.run.toc.relations.release(file);
        }

        // Reinit touched tocs after cache drop.
        // Do not reinit removed toc.
        await this.reinitTocs(state, oldTocsPaths.filter(isExistedToc));

        // List of updated deps. Now we can compare it with old deps list.
        const newDeps = hasNewContent ? (state.getChilds('toc', file) as NormalizedPath[]) : [];
        const depsDiff = diff(oldDeps, newDeps);
        // On compare we search for previously detached toc includes, which name match toc.yaml
        // This detached toc.yaml now possibly transforms to true tocs.
        const detachedTocsPaths = depsDiff.removed.filter(
            (dep) => state.isToc(dep) && !state.isGraphPart('toc', dep),
        );
        // Reinit detached toc.yaml to transform them.
        await this.reinitTocs(state, detachedTocsPaths);

        // A conflict can be fixed by editing another TOC. Finish every pending TOC together.
        const touched = new Set([
            file,
            ...state.affectedTocs,
            ...detachedTocsPaths,
            ...state.getParents('toc', file),
        ]);
        const newTocsPaths = [...touched].filter(state.isKnownToc).filter(isExistedToc);
        const newEntries = await state.getEntries(newTocsPaths);
        await this.invalidateAudienceEntries(state, newEntries);

        // TOC-only URL edits also affect existing page metadata. Check ownership
        // only when a resolved URL changed, preserving nested TOC overrides.
        const changedLlmsTocs = new Set(
            newTocsPaths.filter((path) => oldLlmsUrls.get(path) !== getLlmsUrl(path)),
        );
        this.invalidateLlmsEntries(state, newEntries, changedLlmsTocs);

        const entriesDiff = diff(oldEntries, newEntries);

        // Update added to toc entries
        // because path for this entries can be changed.
        for (const entry of entriesDiff.added) {
            state.invalidateEntry(entry);
        }

        // Update removed from toc entries.
        // Toc path for this entries can be changed.
        for (const entry of entriesDiff.removed) {
            // If entry is not attached to any toc, then we don't need to process it.
            if (!state.isGraphPart('toc', entry)) {
                state.run.entry.relations.release(entry);
                continue;
            }

            // If entry is not exists on graph, then it can't be affected by toc change.
            // if (!state.isGraphPart('entry', entry)) {
            //     continue;
            // }

            state.invalidateEntry(entry);
        }

        // If entries was generated, then we expect that any existed entry can be updated.
        if (isGenerator) {
            for (const entry of entriesDiff.rest) {
                state.invalidateEntry(entry);
            }
        }
    }

    private async invalidateAudienceEntries(state: WatchState, entries: NormalizedPath[]) {
        const {run, pageAudiences: previous} = state;
        const html = run.config.outputFormat === OutputFormat.html;
        const current = run.toc.getPageAudiences();
        const changed = entries.filter(
            (entry) => previous.has(entry) && previous.get(entry) !== current.get(entry),
        );
        if (!changed.length) {
            return;
        }

        // Static HTML embeds its TOC in every page. Other formats read the TOC separately.
        const affected = html && run.config.staticContent ? entries : changed;
        for (const entry of affected) {
            state.invalidateEntry(entry);
        }

        if (html) {
            const obsolete = new Set<NormalizedPath>();
            for (const entry of changed) {
                if (current.get(entry) === 'agent') {
                    obsolete.add(setExt(entry, '.html'));
                    if (run.config.ai.mdCompanions) {
                        obsolete.add(entry);
                    }
                }
            }
            await run.removeOutputFiles(obsolete);
        }
    }

    private invalidateLlmsEntries(
        state: WatchState,
        entries: NormalizedPath[],
        changedTocs: ReadonlySet<NormalizedPath>,
    ) {
        if (!changedTocs.size) {
            return;
        }
        for (const entry of entries) {
            if (changedTocs.has(state.run.toc.for(entry).path)) {
                state.invalidateEntry(entry);
            }
        }
    }

    private async reinitTocs(state: WatchState, tocs: NormalizedPath[]) {
        for (const toc of tocs) {
            state.invalidateToc(toc);
            try {
                await state.run.toc.init([toc]);
            } catch (error) {
                console.log(error);
                state.logger.error(error);
            }
        }
    }

    private async handleChangeEntry(
        file: NormalizedPath,
        state: WatchState,
        {hasNewContent = true} = {},
    ) {
        state.logger.info('Handle entry graph change for', file);

        const deps = state.getParents('entry', file);
        const entries = [file, ...deps].filter(state.isKnownEntry);

        if (state.isEntryResource(file)) {
            if (hasNewContent) {
                await state.run.copy(join(state.run.input, file), join(state.run.output, file));
            } else {
                await state.run.remove(join(state.run.output, file));
            }

            entries.map(state.invalidateEntry);
        } else {
            const sources = [file, ...deps].filter(state.isEntrySource);
            const oldResources = [file, ...deps].filter(state.isEntryResource);

            // A referring page may be rebuilt before its target. Release every include context
            // first so its anchor lookup cannot observe the target's previous include content.
            for (const entry of entries) {
                for (const file of sources) {
                    // Release all includes relative to target entry
                    state.run.entry.release(file, entry);
                }
            }

            for (const entry of entries) {
                const isRemovedEntry = file === entry && !hasNewContent;
                if (!isRemovedEntry) {
                    await state.processEntry(entry);
                }
            }

            const newResources = state.getParents('entry', file).filter(state.isEntryResource);
            const resources = diff(oldResources, newResources);

            for (const resource of resources.added) {
                await state.run.copy(
                    join(state.run.input, resource),
                    join(state.run.output, resource),
                );
            }
        }
    }

    private async handleChangeDetachedEntry(
        file: NormalizedPath,
        state: WatchState,
        {hasNewContent = true} = {},
    ) {
        state.logger.info('Handle detached graph change for', file);

        const files = [file, ...state.getParents('detached', file)] as NormalizedPath[];
        const entries = files.filter(state.isKnownEntry);

        for (const entry of entries) {
            for (const file of files) {
                if (!state.isKnownEntry(file)) {
                    // Release all includes relative to target entry
                    state.run.entry.release(file, entry);
                }
            }

            if (file !== entry || hasNewContent) {
                state.invalidateEntry(entry);
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
    const rest = [];

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

        rest.push(path);
    }

    return {added, removed, rest};
}

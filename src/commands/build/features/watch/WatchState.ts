import type {Build, Run} from '~/commands/build';
import type {EntryTocItem, Toc} from '~/core/toc';

import {dirname, join} from 'node:path';

import {Graph, bounded, normalizePath} from '~/core/utils';

export class WatchState {
    readonly changed = new Set<NormalizedPath>();

    readonly invalide = new Set<NormalizedPath>();

    readonly detachedEntries: Graph = new Graph();

    readonly run: Run;

    readonly logger: Run['logger'];

    private program: Build;

    constructor(program: Build, run: Run) {
        this.program = program;
        this.run = run;
        this.logger = run.logger;
    }

    @bounded invalidateToc(path: NormalizedPath) {
        this.invalide.add(path);
    }

    @bounded invalidateEntry(path: NormalizedPath) {
        const graph = this.run.entry.relations.extract(path);
        this.invalide.add(path);
        this.detachedEntries.consume(graph);
    }

    async processToc(...args: Parameters<Build['processToc']>) {
        return this.program.processToc(...args);
    }

    async processEntry(entry: NormalizedPath) {
        this.run.entry.release(entry);
        this.run.entry.relations.release(entry);
        await this.program.processEntry(entry);
        this.detachedEntries.release(entry);
    }

    @bounded isKnownEntry(path: NormalizedPath) {
        return this.run.toc.isEntry(path);
    }

    @bounded isKnownToc(path: NormalizedPath) {
        return this.run.toc.isToc(path);
    }

    @bounded isKnownTocGenerator(path: NormalizedPath) {
        return this.run.toc.isGenerator(path);
    }

    @bounded isToc(path: NormalizedPath) {
        return Boolean(path.match(/(^|\/|\\)toc.yaml$/));
    }

    @bounded isPreset(path: NormalizedPath) {
        return Boolean(path.match(/(^|\/|\\)presets.yaml$/));
    }

    @bounded isEntrySource(path: NormalizedPath) {
        return this.run.entry.isSource(path);
    }

    @bounded isEntryResource(path: NormalizedPath) {
        return this.run.entry.isResource(path);
    }

    isGraphPart(graph: 'toc' | 'vars' | 'entry' | 'detached', node: NormalizedPath) {
        const store = graph === 'detached' ? this.detachedEntries : this.run[graph].relations;
        return store.hasNode(node);
    }

    getParents(graph: 'toc' | 'vars' | 'entry' | 'detached', node: NormalizedPath) {
        const store = graph === 'detached' ? this.detachedEntries : this.run[graph].relations;
        if (!store.hasNode(node)) {
            return [];
        }

        return store.dependantsOf(node) as NormalizedPath[];
    }

    getChilds(graph: 'toc' | 'vars' | 'entry' | 'detached', node: NormalizedPath) {
        const store = graph === 'detached' ? this.detachedEntries : this.run[graph].relations;
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

import type {Build, Run} from '~/commands/build';
import type {EntryTocItem, PageAudience, Toc} from '~/core/toc';

import {dirname, join} from 'node:path';

import {getTocItemName} from '~/core/toc';
import {Graph, bounded, normalizePath} from '~/core/utils';
import {getHooks as getBuildHooks} from '~/commands/build/hooks';

import {OutputFormat} from '../../config';

type TocTitleSource = Pick<Toc, 'path' | 'title'> & {itemName?: string};

export class WatchState {
    readonly changed = new Map<NormalizedPath, boolean>();

    readonly processedFiles = new Set<NormalizedPath>();

    readonly invalide = new Set<NormalizedPath>();

    readonly detachedEntries: Graph = new Graph();

    readonly affectedTocs = new Set<NormalizedPath>();

    readonly rebuiltEntries = new Set<NormalizedPath>();

    // Keep the audience of the last completed build while a TOC edit is invalid.
    pageAudiences: ReadonlyMap<NormalizedPath, PageAudience> = new Map();

    readonly run: Run;

    readonly logger: Run['logger'];

    private program: Build;

    private readonly tocTitleSources?: Map<NormalizedPath, TocTitleSource>;

    constructor(program: Build, run: Run) {
        this.program = program;
        this.run = run;
        this.logger = run.logger;

        if (run.config.outputFormat === OutputFormat.html) {
            this.tocTitleSources = new Map();
        }
    }

    rememberTocTitle(entry: NormalizedPath) {
        this.tocTitleSources?.set(entry, this.getTocTitleSource(entry));
    }

    invalidateChangedTocTitles(entries: NormalizedPath[]) {
        if (!this.tocTitleSources) {
            return;
        }

        for (const entry of entries) {
            if (this.run.toc.audience(entry) === 'agent') {
                continue;
            }

            const previous = this.tocTitleSources.get(entry);
            const {path, title, itemName} = this.getTocTitleSource(entry);
            if (
                !previous ||
                previous.path !== path ||
                previous.title !== title ||
                previous.itemName !== itemName
            ) {
                this.invalidateEntry(entry);
            }
        }
    }

    forgetTocTitle(entry: NormalizedPath) {
        this.tocTitleSources?.delete(entry);
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
        await this.program.processToc(...args);
        this.affectedTocs.add(args[0].path);
    }

    async processEntry(entry: NormalizedPath) {
        this.run.entry.release(entry);
        this.releaseEntryDependencies(entry);
        await this.program.processEntry(entry);
        this.detachedEntries.release(entry);
        this.rebuiltEntries.add(entry);
    }

    async complete() {
        await getBuildHooks(this.program).AfterRebuild.promise(this.run, {
            files: new Set(this.processedFiles),
            tocs: new Set(this.affectedTocs),
            entries: new Set(this.rebuiltEntries),
        });
        this.pageAudiences = this.run.toc.getPageAudiences();
        this.processedFiles.clear();
        this.affectedTocs.clear();
        this.rebuiltEntries.clear();
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

    private getTocTitleSource(entry: NormalizedPath): TocTitleSource {
        const toc = this.run.toc.for(entry);
        return {path: toc.path, title: toc.title, itemName: getTocItemName(toc, entry)};
    }

    private releaseEntryDependencies(entry: NormalizedPath) {
        const graph = this.run.entry.relations;
        if (!graph.hasNode(entry)) {
            return;
        }

        const prune = (node: string) => {
            if (
                !graph.hasNode(node) ||
                this.run.toc.isEntry(node as NormalizedPath) ||
                graph.directDependentsOf(node).length
            ) {
                return;
            }

            const dependencies = graph.directDependenciesOf(node);
            graph.removeNode(node);
            dependencies.forEach(prune);
        };

        for (const dependency of graph.directDependenciesOf(entry)) {
            graph.removeDependency(entry, dependency);
            prune(dependency);
        }
    }
}

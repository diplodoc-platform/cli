import type {Command} from '~/core/config';
import type {Build, OpenapiCompanionEntry, Run} from '~/commands/build';
import type {Redirects} from '../../services/redirects';

import {join, parse} from 'node:path';

import {getHooks as getBaseHooks} from '~/core/program';
import {getHooks as getBuildHooks} from '~/commands/build';
import {resolveConfig, valuable} from '~/core/config';

import {getHooks as getEntryHooks} from '../../services/entry';

import {options} from './config';

type FileDescriptor = {
    ext: string;
    toc: string;
};

type TrieNode = {
    file?: FileDescriptor;
    children?: FileTrie;
};

type FileTrie = {
    [key: string]: TrieNode | undefined;
};

type FileTrieEntryPoint = {
    trie: FileTrie;
    tocMapping: Record<string, string>;
};

type RestrictedAccessMap = Record<string, string[][]>;

type PageMetadata = {
    restrictedAccess: RestrictedAccessMap;
    pageModifiedTimes?: Record<string, string>;
};

type ManifestEntryInfo = {
    pageModifiedTime?: string;
};

type BuildManifestFormat = {
    fileTrie: FileTrieEntryPoint;
    yfmConfig: unknown;
    redirects: Redirects;
    openapiCompanions?: OpenapiCompanionEntry[];
    restrictedAccess: RestrictedAccessMap;
    pageModifiedTimes?: Record<string, string>;
};

const MANIFEST_FILENAME = 'yfm-build-manifest.json';

export type BuildManifestArgs = {
    buildManifest: boolean;
};

export type BuildManifestConfig = {
    buildManifest: boolean;
};

export class BuildManifest {
    private lastTocId = 0;

    private readonly modificationTimes = new WeakMap<
        Run,
        Map<NormalizedPath, string | undefined>
    >();

    apply(program: Build) {
        getBaseHooks(program).Command.tap('BuildManifest', (command: Command) => {
            command.addOption(options.buildManifest);
        });

        getBaseHooks(program).Config.tapPromise('BuildManifest', async (config, args) => {
            config.buildManifest = this.resolveEnabled(config.buildManifest, args.buildManifest);

            return config;
        });

        getBuildHooks(program)
            .BeforeRun.for('md')
            .tap('BuildManifest', (run) => {
                if (!run.config.buildManifest || !run.config.mtimes.enabled) {
                    return;
                }

                this.modificationTimes.set(run, new Map());
                getEntryHooks(run.entry).Dump.tap(
                    {name: 'BuildManifest', stage: Infinity},
                    (entry) => {
                        // Entry info crosses the worker boundary; reuse the metadata already
                        // finalized for output instead of reading or dumping the page again.
                        (entry.info as ManifestEntryInfo).pageModifiedTime =
                            entry.data.meta.updatedAt;
                    },
                );
            });

        getBuildHooks(program)
            .Entry.for('md')
            .tap('BuildManifest', (run, entry, info) => {
                this.modificationTimes
                    .get(run)
                    ?.set(entry, (info as ManifestEntryInfo).pageModifiedTime);
            });

        getBuildHooks(program)
            .AfterRun.for('md')
            .tapPromise('BuildManifest', async (run: Run) => {
                if (!run.config.buildManifest) {
                    return;
                }

                const redirects = run.redirects.rawRedirects;
                const fileTrie = this.buildFileTrie(run);
                const yfmConfig = await this.readYfmConfig(run);
                const openapiCompanions = this.collectOpenapiCompanions(run);
                const pageMetadata = await this.collectPageMetadata(run);

                const manifest: BuildManifestFormat = {
                    redirects,
                    fileTrie,
                    yfmConfig,
                    ...pageMetadata,
                    ...(openapiCompanions.length ? {openapiCompanions} : {}),
                };

                await run.write(
                    join(run.output, MANIFEST_FILENAME),
                    JSON.stringify(manifest),
                    true,
                );
            });
    }

    private resolveEnabled(configValue: unknown, argumentValue: unknown): boolean {
        let enabled = true;

        if (valuable(configValue)) {
            enabled = Boolean(configValue);
        }

        if (valuable(argumentValue)) {
            enabled = Boolean(argumentValue);
        }

        return enabled;
    }

    /**
     * Reads OpenAPI companion entries recorded by the openapi includer extension during the run.
     *
     * No flag/format check is needed here: emission is gated upstream in the openapi includer
     * (`ai.openapiCompanions` + `outputFormat` + size limits). The includer only returns a
     * companion file when it should be written, the openapi CLI extension only registers entries
     * for files it actually wrote, so `run.openapiCompanions` is already the gated set.
     *
     * Entries are deduplicated and sorted for deterministic manifest output.
     */
    private collectOpenapiCompanions(run: Run): OpenapiCompanionEntry[] {
        const raw = (run as Run & {openapiCompanions?: OpenapiCompanionEntry[]}).openapiCompanions;

        if (!Array.isArray(raw) || raw.length === 0) {
            return [];
        }

        const byCompanionPath = new Map<string, OpenapiCompanionEntry>();
        for (const entry of raw) {
            byCompanionPath.set(entry.companionPath, entry);
        }

        return [...byCompanionPath.values()].sort((a, b) =>
            a.companionPath.localeCompare(b.companionPath),
        );
    }

    /**
     * Collects access rules and VCS modification dates in one metadata traversal.
     * Uses the same `meta.dump()` output that md2md writes into page frontmatter.
     */
    private async collectPageMetadata(run: Run): Promise<PageMetadata> {
        const entries: [string, string[][]][] = [];
        const pageModifiedTimes: Record<string, string> = Object.create(null);
        const selectedExtensions = new Map<string, string>();
        const modificationTimes = this.modificationTimes.get(run);

        for (const path of run.toc.entries) {
            const meta = await run.meta.dump(path);
            const access = meta['restricted-access'];

            if (access?.length) {
                entries.push([path.replace(/\..+$/, ''), access]);
            }

            if (run.config.mtimes.enabled) {
                this.collectPageModifiedTime(
                    path,
                    modificationTimes?.has(path) ? modificationTimes.get(path) : meta.updatedAt,
                    selectedExtensions,
                    pageModifiedTimes,
                );
            }
        }

        entries.sort(([left], [right]) => left.localeCompare(right));

        return {
            restrictedAccess: Object.fromEntries(entries),
            ...(run.config.mtimes.enabled && {pageModifiedTimes}),
        };
    }

    private collectPageModifiedTime(
        path: string,
        updatedAt: unknown,
        selectedExtensions: Map<string, string>,
        pageModifiedTimes: Record<string, string>,
    ): void {
        const {ext} = parse(path);
        const page = path.slice(0, path.length - ext.length);
        const selected = selectedExtensions.get(page);

        // Match the file trie when several source formats share one URL.
        if (selected !== undefined && !this.shouldReplaceFile(selected, ext)) {
            return;
        }

        selectedExtensions.set(page, ext);
        delete pageModifiedTimes[page];
        const modificationDate = typeof updatedAt === 'string' ? new Date(updatedAt) : undefined;
        if (modificationDate && Number.isFinite(modificationDate.getTime())) {
            pageModifiedTimes[page] = modificationDate.toISOString();
        }
    }

    private async readYfmConfig(run: Run): Promise<unknown> {
        try {
            const yfmConfigPath = run.configPath;

            return (await resolveConfig(yfmConfigPath)) ?? {};
        } catch (error) {
            run.logger.warn(`BuildManifest: Failed to read YFM config: ${error}`);

            return {};
        }
    }

    private buildFileTrie(run: Run): FileTrieEntryPoint {
        // Trie levels are used as string->node maps. They MUST be prototype-less,
        // otherwise path segments that collide with `Object.prototype` members
        // (e.g. `constructor`, `toString`, `valueOf`, `hasOwnProperty`, `__proto__`)
        // resolve to inherited values instead of `undefined`. In particular a
        // `constructor` segment would resolve to the native `Object` function, which
        // `JSON.stringify` silently drops, making the whole subtree disappear from the manifest.
        const createTrie = (): FileTrie => Object.create(null);

        const fileTrie: FileTrie = createTrie();
        const reverseTocMapping: Record<string, string> = Object.fromEntries(
            run.toc.tocs
                .map(({path}) => path)
                .sort()
                .map((path) => [path, this.nextId()]),
        );

        const getOrAddTocToMapping = (tocPath: NormalizedPath) => {
            const mapping = reverseTocMapping[tocPath] ?? this.nextId();

            reverseTocMapping[tocPath] = mapping;

            return mapping;
        };

        const addFile = (path: NormalizedPath) => {
            const pathParts = path.split('/');

            if (pathParts.length === 0) {
                run.logger.warn(
                    `BuildManifest: Attempted to add an empty path to the prefix tree.`,
                );

                return;
            }

            const fileWithExtension = pathParts[pathParts.length - 1];
            const dirs = pathParts.slice(0, -1);

            const {name, ext} = parse(fileWithExtension);

            let lastHead: FileTrie = fileTrie;

            dirs.forEach((dir) => {
                const maybeExisting = lastHead[dir];
                const trieNode = maybeExisting ?? {};
                const newChildren = trieNode.children ?? createTrie();
                lastHead[dir] = trieNode;

                trieNode.children = newChildren;

                lastHead = newChildren;
            }, fileTrie);

            if (lastHead[name]?.file) {
                const pathToReport = path.replace(/\..+$/, '');
                const existingExt = lastHead[name]?.file?.ext;
                if (existingExt === undefined) {
                    return;
                }
                const shouldReplace = this.shouldReplaceFile(existingExt, ext);

                if (!shouldReplace) {
                    run.logger.warn(
                        `BuildManifest: Skipping file with extension \`${ext}\` at path \`${pathToReport}\` because file with extension \`${existingExt}\` already exists and has higher priority.`,
                    );
                    return;
                }

                run.logger.warn(
                    `BuildManifest: Replacing file with extension \`${existingExt}\` at path \`${pathToReport}\` with file with extension \`${ext}\` due to priority.`,
                );
            }

            const trieNode = lastHead[name] ?? {};
            const file = {ext: ext, toc: getOrAddTocToMapping(run.toc.for(path).path)};

            trieNode.file = file;
            lastHead[name] = trieNode;
        };

        run.toc.entries.forEach(addFile);

        return {
            trie: fileTrie,
            tocMapping: Object.fromEntries(
                Object.entries(reverseTocMapping).map(([k, v]) => [v, k]),
            ),
        };
    }

    private shouldReplaceFile(existingExt: string, newExt: string): boolean {
        const priority: Record<string, number> = {
            '.md': 3,
            '.yaml': 2,
            '.yml': 2,
            '.html': 1,
        };

        const existingPriority = priority[existingExt] || 0;
        const newPriority = priority[newExt] || 0;

        return newPriority > existingPriority;
    }

    private nextId() {
        return `t${this.lastTocId++}`;
    }
}

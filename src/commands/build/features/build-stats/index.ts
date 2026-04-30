import type {Command} from '~/core/config';
import type {Build, EntryInfo, Run} from '~/commands/build';

import {extname, join} from 'node:path';
import {arch, platform, release as osRelease} from 'node:os';
import {createHash} from 'node:crypto';

import {getHooks as getBaseHooks} from '~/core/program';
import {getHooks as getBuildHooks} from '~/commands/build';
import {valuable} from '~/core/config';
import {VERSION} from '~/constants';
import {stats as loggerStats} from '~/core/logger';
import {langFromPath} from '~/core/utils';

import {options} from './config';

const STATS_FILENAME = 'yfm-build-stats.json';
const SCHEMA_VERSION = 1;

type CountByKey = Record<string, number>;

type OutputInfo = {
    files: number;
    totalBytes: number;
    bytesByExtension: CountByKey;
    largestFile: {path: string; bytes: number} | null;
};

type BuildStatsFormat = {
    schemaVersion: typeof SCHEMA_VERSION;
    cli: {
        version: string;
        node: string;
        platform: string;
        arch: string;
        osRelease: string;
    };
    build: {
        startedAt: string;
        finishedAt: string;
        durationMs: number;
        // Coarse phase split derived from Entry hook timestamps.
        // `prepare` covers everything before the first entry was processed,
        // `entries` is the time between the first and last entry,
        // `finalize` is what happened after the last entry (release + aggregators).
        // Phases are null when no entries were produced.
        phasesMs: {
            prepare: number | null;
            entries: number | null;
            finalize: number | null;
        };
        outputFormat: string;
        langs: string[];
        inputDir: string;
        outputDir: string;
        configHash: string;
        features: string[];
        worker: {
            maxOldSpace: number | null;
        };
    };
    counters: {
        tocs: number;
        entriesPlanned: number;
        entriesProcessed: number;
        entriesByExtension: CountByKey;
        entriesByLang: CountByKey;
        // Sums collected from per-entry `Entry`-hook info. Markdown only —
        // leading (yaml) entries don't have headings/html.
        headings: number;
        contentBytes: number;
        // Aggregated from `run.entry.relations` after build:
        //   entries   — pages themselves (md/yaml leading)
        //   sources   — included markdown files + autotitle link targets
        //   resources — image/video assets + meta script/style references
        //   missed    — paths the build tried to read but didn't find
        //   edges     — total dependency edges (rough connectedness signal)
        graph: {
            entries: number;
            sources: number;
            resources: number;
            missed: number;
            edges: number;
        };
        warnings: number;
        errors: number;
    };
    output: OutputInfo;
};

export type BuildStatsArgs = {
    buildStats: boolean;
};

export type BuildStatsConfig = {
    buildStats: boolean;
};

export class BuildStats {
    private startedAt = 0;

    private firstEntryAt = 0;

    private lastEntryAt = 0;

    private entryCount = 0;

    private entriesByExtension: CountByKey = {};

    private entriesByLang: CountByKey = {};

    private headings = 0;

    private contentBytes = 0;

    apply(program: Build) {
        getBaseHooks(program).Command.tap('BuildStats', (command: Command) => {
            command.addOption(options.buildStats);
        });

        getBaseHooks(program).Config.tapPromise('BuildStats', async (config, args) => {
            let buildStats = false;

            if (valuable(config.buildStats)) {
                buildStats = Boolean(config.buildStats);
            }

            if (valuable(args.buildStats)) {
                buildStats = Boolean(args.buildStats);
            }

            config.buildStats = buildStats;

            return config;
        });

        getBaseHooks<Run>(program).BeforeAnyRun.tap('BuildStats', (run) => {
            if (!run.config.buildStats) {
                return;
            }

            this.reset();
            this.startedAt = Date.now();
        });

        const onEntry = (run: Run, entry: NormalizedPath, info: DeepFrozen<EntryInfo>) => {
            if (!run.config.buildStats) {
                return;
            }

            const now = Date.now();
            if (!this.firstEntryAt) {
                this.firstEntryAt = now;
            }
            this.lastEntryAt = now;

            this.entryCount++;

            const ext = (extname(entry) || '<noext>').toLowerCase();
            this.entriesByExtension[ext] = (this.entriesByExtension[ext] ?? 0) + 1;

            const lang = langFromPath(entry, run.config) || '<none>';
            this.entriesByLang[lang] = (this.entriesByLang[lang] ?? 0) + 1;

            // Markdown-only payload: leading (yaml) pages don't have headings/html.
            if (info.leading === false) {
                this.headings += info.headings?.length ?? 0;
                this.contentBytes += info.html?.length ?? 0;
            }
        };

        getBuildHooks(program).Entry.for('md').tap('BuildStats', onEntry);
        getBuildHooks(program).Entry.for('html').tap('BuildStats', onEntry);

        getBaseHooks<Run>(program).AfterAnyRun.tapPromise('BuildStats', async (run) => {
            if (!run.config.buildStats) {
                return;
            }

            const finishedAt = Date.now();
            const logCounts = loggerStats(run.logger);

            const output = await readOutputSize(run);

            const stats: BuildStatsFormat = {
                schemaVersion: SCHEMA_VERSION,
                cli: {
                    version: VERSION,
                    node: process.version,
                    platform: platform(),
                    arch: arch(),
                    osRelease: osRelease(),
                },
                build: {
                    startedAt: new Date(this.startedAt).toISOString(),
                    finishedAt: new Date(finishedAt).toISOString(),
                    durationMs: finishedAt - this.startedAt,
                    phasesMs: {
                        prepare: this.firstEntryAt ? this.firstEntryAt - this.startedAt : null,
                        entries: this.firstEntryAt ? this.lastEntryAt - this.firstEntryAt : null,
                        finalize: this.lastEntryAt ? finishedAt - this.lastEntryAt : null,
                    },
                    outputFormat: String(run.config.outputFormat),
                    langs: (run.config.langs ?? []).map(toLangCode),
                    inputDir: run.originalInput,
                    outputDir: run.output,
                    configHash: hashConfig(run.config),
                    features: collectFeatures(run.config as Hash<unknown>),
                    worker: {
                        maxOldSpace:
                            ((run.config as Hash<unknown>).workerMaxOldSpace as
                                | number
                                | undefined) ?? null,
                    },
                },
                counters: {
                    tocs: run.toc.tocs.length,
                    entriesPlanned: run.toc.entries.length,
                    entriesProcessed: this.entryCount,
                    entriesByExtension: this.entriesByExtension,
                    entriesByLang: this.entriesByLang,
                    headings: this.headings,
                    contentBytes: this.contentBytes,
                    graph: collectGraph(run),
                    warnings: logCounts.warn,
                    errors: logCounts.error,
                },
                output,
            };

            await run.write(join(run.output, STATS_FILENAME), JSON.stringify(stats, null, 2), true);
        });
    }

    private reset() {
        this.startedAt = 0;
        this.firstEntryAt = 0;
        this.lastEntryAt = 0;
        this.entryCount = 0;
        this.entriesByExtension = {};
        this.entriesByLang = {};
        this.headings = 0;
        this.contentBytes = 0;
    }
}

function toLangCode(lang: string | {lang: string}): string {
    return typeof lang === 'string' ? lang : lang.lang;
}

// Surface every config field that resolved to literal `true`. No whitelist —
// whatever flags the user (or defaults) turned on shows up here.
export function collectFeatures(config: Hash<unknown>): string[] {
    return Object.keys(config)
        .filter((key) => config[key] === true)
        .sort();
}

type GraphCounters = BuildStatsFormat['counters']['graph'];

function collectGraph(run: Run): GraphCounters {
    const relations = run.entry.relations;
    const counters: GraphCounters = {
        entries: 0,
        sources: 0,
        resources: 0,
        missed: 0,
        edges: 0,
    };

    const nodes = relations.overallOrder();
    for (const node of nodes) {
        const data = relations.getNodeData(node) as {type?: string} | undefined;
        switch (data?.type) {
            case 'entry':
                counters.entries++;
                break;
            case 'source':
                counters.sources++;
                break;
            case 'resource':
                counters.resources++;
                break;
            case 'missed':
                counters.missed++;
                break;
        }
        counters.edges += relations.directDependenciesOf(node).length;
    }

    return counters;
}

function stableStringify(value: unknown): string {
    if (value === null || typeof value !== 'object') {
        return JSON.stringify(value) ?? 'null';
    }
    if (Array.isArray(value)) {
        return '[' + value.map(stableStringify).join(',') + ']';
    }
    const keys = Object.keys(value as object).sort();
    return (
        '{' +
        keys
            .map((k) => JSON.stringify(k) + ':' + stableStringify((value as Hash<unknown>)[k]))
            .join(',') +
        '}'
    );
}

export function hashConfig(config: unknown): string {
    return createHash('sha256').update(stableStringify(config)).digest('hex').slice(0, 16);
}

const EMPTY_OUTPUT: OutputInfo = {
    files: 0,
    totalBytes: 0,
    bytesByExtension: {},
    largestFile: null,
};

async function readOutputSize(run: Run): Promise<OutputInfo> {
    let files: NormalizedPath[];
    try {
        files = await run.glob('**/*', {cwd: run.output});
    } catch (error) {
        run.logger.warn(`BuildStats: failed to glob output directory: ${error}`);
        return EMPTY_OUTPUT;
    }

    let totalBytes = 0;
    let largestFile: OutputInfo['largestFile'] = null;
    const bytesByExtension: CountByKey = {};

    await Promise.all(
        files.map(async (file) => {
            try {
                const stat = await run.fs.stat(join(run.output, file));
                const size = stat.size;

                totalBytes += size;
                if (!largestFile || size > largestFile.bytes) {
                    largestFile = {path: file, bytes: size};
                }
                const ext = (extname(file) || '<noext>').toLowerCase();
                bytesByExtension[ext] = (bytesByExtension[ext] ?? 0) + size;
            } catch {
                // File could be removed between glob and stat — silently skip.
            }
        }),
    );

    return {
        files: files.length,
        totalBytes,
        bytesByExtension,
        largestFile,
    };
}

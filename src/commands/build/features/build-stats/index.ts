import type {Command} from '~/core/config';
import type {Build, EntryInfo, Run} from '~/commands/build';

import {extname, join} from 'node:path';
import {arch, release as osRelease, platform} from 'node:os';
import pmap from 'p-map';

import {getHooks as getBaseHooks} from '~/core/program';
import {getHooks as getBuildHooks} from '~/commands/build';
import {valuable} from '~/core/config';
import {VERSION} from '~/constants';
import {getHooks as getLoggerHooks, stats as loggerStats} from '~/core/logger';
import {langFromPath} from '~/core/utils';
import {OutputFormat} from '~/commands/build/config';

import {options} from './config';

const STATS_FILENAME = 'yfm-build-stats.json';
const SCHEMA_VERSION = 1;
const STAT_CONCURRENCY = 30;

type CountByKey = Record<string, number>;

type OutputInfo = {
    files: number;
    totalBytes: number;
    bytesByExtension: CountByKey;
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
        features: string[];
        // process.memoryUsage().heapUsed snapshot at AfterAnyRun, in MB.
        // Final snapshot, not a peak — but cheap and useful as a regression
        // signal ("build started consuming 2x more memory").
        memoryUsageMb: number;
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
        // Per-code breakdown of logged warnings/errors. Codes look like
        // `YFM\d+` (e.g. YFM013, YFM017); messages without a recognizable
        // code go into the `(uncoded)` bucket.
        warningsByCode: CountByKey;
        errorsByCode: CountByKey;
    };
    output: OutputInfo;
};

const CODE_RE = /\bYFM\d+\b/;
const UNCODED = '(uncoded)';

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

    private warningsByCode: CountByKey = {};

    private errorsByCode: CountByKey = {};

    apply(program: Build) {
        getBaseHooks(program).Command.tap('BuildStats', (command: Command) => {
            command.addOption(options.buildStats);
        });

        getBaseHooks(program).Config.tapPromise('BuildStats', async (config, args) => {
            // Default to on for md2md builds: CI pipelines for md→md
            // benefit from the artifact (regression tracking, asset accounting),
            // and the read overhead is dominated by the build itself in this
            // mode. For html builds it stays off — local dev shouldn't pay the
            // extra fs walk by default. Users can flip either side via
            // `--no-build-stats` / `buildStats: false`.
            let buildStats = config.outputFormat === OutputFormat.md;

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

            const loggerHooks = getLoggerHooks(run.logger);
            loggerHooks.Warn.tap('BuildStats', (message) => {
                this.bucketByCode(this.warningsByCode, message);
            });
            loggerHooks.Error.tap('BuildStats', (message) => {
                this.bucketByCode(this.errorsByCode, message);
            });
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
                // String.length is UTF-16 code units, not bytes — use UTF-8
                // byte length to get a real "content size in bytes".
                this.contentBytes += info.html ? Buffer.byteLength(info.html, 'utf8') : 0;
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
                    features: collectFeatures(run.config as Hash<unknown>),
                    memoryUsageMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
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
                    warningsByCode: this.warningsByCode,
                    errorsByCode: this.errorsByCode,
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
        this.warningsByCode = {};
        this.errorsByCode = {};
    }

    private bucketByCode(target: CountByKey, message: string) {
        const match = message.match(CODE_RE);
        const code = match ? match[0] : UNCODED;
        target[code] = (target[code] ?? 0) + 1;
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

const EMPTY_OUTPUT: OutputInfo = {
    files: 0,
    totalBytes: 0,
    bytesByExtension: {},
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
    const bytesByExtension: CountByKey = {};

    // Bound concurrency so we don't open thousands of FDs at once and trip
    // EMFILE on outputs with lots of files.
    await pmap(
        files,
        async (file) => {
            try {
                const stat = await run.fs.stat(join(run.output, file));
                const size = stat.size;

                totalBytes += size;
                const ext = (extname(file) || '<noext>').toLowerCase();
                bytesByExtension[ext] = (bytesByExtension[ext] ?? 0) + size;
            } catch {
                // File could be removed between glob and stat — silently skip.
            }
        },
        {concurrency: STAT_CONCURRENCY},
    );

    return {
        files: files.length,
        totalBytes,
        bytesByExtension,
    };
}

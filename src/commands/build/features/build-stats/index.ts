import type {Command} from '~/core/config';
import type {Build, Run} from '~/commands/build';

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
        missed: number;
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

        const onEntry = (run: Run, entry: NormalizedPath) => {
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
                    missed: countMissed(run),
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

function countMissed(run: Run): number {
    let count = 0;
    for (const node of run.entry.relations.overallOrder()) {
        const data = run.entry.relations.getNodeData(node) as {type?: string} | undefined;
        if (data?.type === 'missed') {
            count++;
        }
    }
    return count;
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

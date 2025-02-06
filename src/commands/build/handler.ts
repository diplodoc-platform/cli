import type {Run} from './run';

import 'threads/register';

import {ArgvService, SearchService} from '~/services';
import {processChangelogs, processLogs} from '~/steps';
import {getNavigationPaths, getPresetIndex, getScopePreset} from '~/reCli/components/presets';
import {getTocIndex, transformTocForJs, transformTocForSinglePage} from '~/reCli/components/toc';
import GithubConnector from '~/reCli/components/vcs/github';
import {getVcsConnector} from '~/reCli/components/vcs/vcs';
import path from 'node:path';
import fs from 'node:fs';
import pMap from 'p-map';
import {cachedMkdir} from '~/reCli/utils';
import yaml from 'js-yaml';
import {CONCURRENCY, WORKER_COUNT, WorkerDataType} from '~/reCli/constants';
import {FileMetaMap} from '~/reCli/types';
import {SinglePageResult} from '~/models';
// @ts-ignore
import {Pool, spawn} from 'threads';
import {chunk, isEmpty} from 'lodash';
import {TransformWorker} from '~/reCli/workers/transform';
import {saveSinglePages} from '~/reCli/components/render/singlePage';
import {copyAssets} from '~/reCli/components/assets/assets';
import {saveRedirectPage} from '~/reCli/components/render/redirect';
import {LogCollector} from '~/reCli/utils/logger';
import {getMapFile} from '~/reCli/components/toc/mapFile';
import {BuildConfig} from '~/commands/build/index';

import {legacyConfig as legacyConfigFn} from './legacy-config';
import {DocInnerProps} from '@diplodoc/client';

export async function handler(run: Run) {
    try {
        const legacyConfig = legacyConfigFn(run);
        ArgvService.init(legacyConfig);
        SearchService.init();

        const {input, output, outputFormat, singlePage, addMapFile} = run.config;
        const {applyPresets, resolveConditions} = legacyConfig;

        const presetIndex = await getPresetIndex(run.input, run.config, run);

        const logger = new LogCollector(run.config.quiet);

        const tocIndex = await getTocIndex(input, {
            options: run.config,
            presetIndex,
            logger,
            run,
        });

        let vcsConnector;
        let connectorData: ReturnType<GithubConnector['serialize']> | undefined;
        if (legacyConfig.contributors) {
            vcsConnector = getVcsConnector({
                options: run.config,
                cwd: run.input,
                logger,
                run,
            });
            if (vcsConnector) {
                await vcsConnector.init();
                const {fileMtime} = vcsConnector;
                tocIndex.forEach(({copyMap}) => {
                    copyMap.forEach((targetLocal, sourceLocal) => {
                        const time = fileMtime.get(sourceLocal);
                        if (time !== undefined) {
                            fileMtime.set(targetLocal, time);
                        }
                    });
                });
                connectorData = vcsConnector.serialize();
            }
        }

        await getPresetIndex(run.input, run.config, run, presetIndex);

        const pageSet = new Set<string>();
        const fileMetaMap: FileMetaMap = new Map();

        await pMap(
            Array.from(tocIndex.entries()),
            async ([tocPath, {toc, copyMap}]) => {
                logger.info(`Handle toc ${tocPath}`);

                if (outputFormat === 'md') {
                    await cachedMkdir(path.dirname(path.join(output, tocPath)));
                    await fs.promises.writeFile(path.join(output, tocPath), yaml.dump(toc));
                } else {
                    const transformedToc = transformTocForJs(toc, path.dirname(tocPath));
                    const tocJsPath = path.join(
                        path.dirname(tocPath),
                        `${path.basename(tocPath, path.extname(tocPath))}.js`,
                    );
                    const targetPath = path.join(output, tocJsPath);
                    await cachedMkdir(path.dirname(targetPath));
                    await fs.promises.writeFile(
                        targetPath,
                        `window.__DATA__.data.toc = ${JSON.stringify(transformedToc)};`,
                    );

                    if (singlePage) {
                        const transformedToc = transformTocForSinglePage(
                            toc,
                            path.dirname(tocPath),
                        );
                        const tocJsPath = path.join(path.dirname(tocPath), `single-page-toc.js`);
                        const targetPath = path.join(output, tocJsPath);
                        await cachedMkdir(path.dirname(targetPath));
                        await fs.promises.writeFile(
                            targetPath,
                            `window.__DATA__.data.toc = ${JSON.stringify(transformedToc)};`,
                        );
                    }

                    await saveRedirectPage(output, run.config);
                }

                getNavigationPaths(tocPath, toc).forEach((page) => {
                    pageSet.add(page);
                });
                copyMap.forEach((targetLocal, sourceLocal) => {
                    fileMetaMap.set(targetLocal, {sourcePath: sourceLocal});
                });
            },
            {concurrency: CONCURRENCY},
        );
        const pages = Array.from(pageSet.values());

        if (addMapFile) {
            const map = getMapFile(pages);
            await fs.promises.writeFile(
                path.join(output, 'files.json'),
                JSON.stringify(map, null, '\t'),
            );
        }

        const writeConflicts = new Map<string, string>();
        const singlePageTocPagesMap = new Map<string, SinglePageResult[]>();

        const workerCount = Number(WORKER_COUNT);
        // eslint-disable-next-line new-cap
        const transformPool = Pool(
            () =>
                spawn<TransformWorker>(new Worker('./workers/transform'), {
                    timeout: 60000,
                }),
            workerCount,
        );
        try {
            const tmpSource = input;
            const tmpThreads = path.join(input, '__threads');
            const tmpDraft = path.join(input, '__draft');
            let workerIndex = 0;
            const workerIndexMap = new WeakMap();
            const pageParts = chunk(pages, 64);
            pageParts.forEach((pagesLocal) => {
                transformPool.queue(async (worker: TransformWorker) => {
                    let index = workerIndexMap.get(worker);
                    if (typeof index !== 'number') {
                        index = workerIndex++;
                        workerIndexMap.set(worker, index);
                        const threadOutput = path.join(tmpThreads, String(index));

                        const configClone: Record<string, unknown> = {};
                        // eslint-disable-next-line guard-for-in
                        for (const key in run.config) {
                            configClone[key] = run.config[key as keyof BuildConfig];
                        }

                        const subj = await worker.init({
                            config: configClone as BuildConfig,
                            presetIndex,
                            tmpSource,
                            tmpDraft,
                            output: threadOutput,
                            fileMetaMap,
                            connectorData,
                            tocIndex,
                        });
                        // @ts-ignore
                        subj.subscribe(({type, payload}) => {
                            switch (type) {
                                case WorkerDataType.Search: {
                                    const {path, props} = payload as {
                                        path: string;
                                        props: DocInnerProps;
                                    };
                                    SearchService.add(path, props);
                                }
                            }
                        });
                    }

                    const {
                        writeConflicts: writeConflictsLocal,
                        singlePageTocPagesMap: singlePageTocPagesMapLocal,
                    } = await worker.run({
                        pages: pagesLocal,
                    });

                    writeConflictsLocal.forEach((value, key) => {
                        writeConflicts.set(key, value);
                    });
                    if (singlePageTocPagesMapLocal) {
                        singlePageTocPagesMapLocal.forEach((value, key) => {
                            const items = singlePageTocPagesMap.get(key) || [];
                            items.push(...value);
                            singlePageTocPagesMap.set(key, items);
                        });
                    }
                });
            });

            if (pages.length) {
                await transformPool.completed();
            }

            const TARGET_COPY_SET = new Set();
            const PRESET_DIR_SET = new Set();
            await Promise.all(
                new Array(workerIndex).fill(0).map(async (_, i) => {
                    const threadOutput = path.join(tmpThreads, String(i));
                    const files = await run.glob('**', {
                        cwd: threadOutput,
                    });
                    await pMap(
                        files,
                        async (filename) => {
                            const sourcePath = path.join(threadOutput, filename);
                            const targetPath = path.join(output, filename);
                            if (TARGET_COPY_SET.has(filename)) {
                                // console.log('Skip override', filename);
                                return;
                            }
                            TARGET_COPY_SET.add(filename);

                            let fileDir = path.dirname(filename);
                            while (!PRESET_DIR_SET.has(fileDir)) {
                                PRESET_DIR_SET.add(fileDir);
                                fileDir = path.dirname(fileDir);
                            }

                            await cachedMkdir(path.dirname(targetPath));
                            await fs.promises.rename(sourcePath, targetPath);
                        },
                        {concurrency: CONCURRENCY},
                    );
                }),
            );

            if (outputFormat === 'md' && (!applyPresets || !resolveConditions)) {
                await pMap(
                    Array.from(presetIndex.entries()),
                    async ([presetPath, preset]) => {
                        const presetDir = path.dirname(presetPath);
                        const scopePreset = getScopePreset(preset, run.config);
                        if (!PRESET_DIR_SET.has(presetDir) || isEmpty(scopePreset)) return;

                        const targetPath = path.join(run.output, presetPath);
                        await cachedMkdir(path.dirname(targetPath));
                        await fs.promises.writeFile(targetPath, yaml.dump(scopePreset));
                    },
                    {concurrency: CONCURRENCY},
                );
            }

            await Promise.all([
                fs.promises.rm(tmpThreads, {recursive: true, force: true}),
                fs.promises.rm(tmpDraft, {recursive: true, force: true}),
            ]);
        } finally {
            await transformPool.terminate(true);
        }

        await pMap(
            Array.from(writeConflicts.entries()),
            async ([relTarget, data]) => {
                logger.warn(`Override ${relTarget}`);
                const targetFilename = path.join(output, relTarget);
                await cachedMkdir(path.dirname(targetFilename));
                await fs.promises.writeFile(targetFilename, data);
            },
            {concurrency: CONCURRENCY},
        );

        if (singlePage) {
            await saveSinglePages({
                targetCwd: output,
                options: run.config,
                singlePageTocPagesMap,
                tocIndex,
                logger,
            });
        }

        await copyAssets({
            run,
            options: run.config,
            cwd: input,
            targetCwd: output,
            pages,
            logger,
        });

        await SearchService.release();

        await processChangelogs();
    } catch (error) {
        run.logger.error(error);
    } finally {
        processLogs(run.input);
    }
}

import type {Run} from './run';

import 'threads/register';

import {ArgvService, SearchService} from '~/services';
import {processLogs} from '~/steps';
import {getNavigationPaths, getPresetIndex} from '~/reCli/components/presets';
import {getTocIndex, transformTocForJs} from '~/reCli/components/toc';
import {logger} from '~/utils';
import GithubConnector from '~/reCli/components/vcs/github';
import {getVcsConnector} from '~/reCli/components/vcs/vcs';
import path from 'node:path';
import fs from 'node:fs';
import pMap from 'p-map';
import {cachedMkdir} from '~/reCli/utils';
import yaml from 'js-yaml';
import {CONCURRENCY, WORKER_COUNT} from '~/reCli/constants';
import {FileMetaMap} from '~/reCli/types';
import {SinglePageResult} from '~/models';
// @ts-ignore
import {Pool, spawn} from 'threads';
import {chunk} from 'lodash';
import {TransformWorker} from '~/reCli/workers/transform';
import {saveSinglePages} from '~/reCli/components/render/singlePage';
import {copyAssets} from '~/reCli/components/assets/assets';

import {legacyConfig} from './legacy-config';

export async function handler(run: Run) {
    try {
        const lConfig = legacyConfig(run);
        ArgvService.init(lConfig);
        SearchService.init();

        const {input, output, outputFormat, singlePage} = run.config;
        const {applyPresets, resolveConditions} = lConfig;

        const presetIndex = await getPresetIndex(run.input, run.config, run);

        const tocIndex = await getTocIndex(input, {
            options: run.config,
            presetIndex,
            logger,
            run,
        });

        let vcsConnector;
        let connectorData: ReturnType<GithubConnector['serialize']> | undefined;
        if (lConfig.contributors) {
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

        if (outputFormat === 'md' && (!applyPresets || !resolveConditions)) {
            await pMap(
                Array.from(presetIndex.entries()),
                async ([presetPath, preset]) => {
                    const targetPath = path.join(run.output, presetPath);
                    await cachedMkdir(path.dirname(targetPath));
                    await fs.promises.writeFile(targetPath, yaml.dump(preset));
                },
                {concurrency: CONCURRENCY},
            );
        }

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

        const writeConflicts = new Map<string, string>();
        const singlePageTocPagesMap = new Map<string, SinglePageResult[]>();

        const workerCount = Number(WORKER_COUNT);
        // eslint-disable-next-line new-cap
        const transformPool = Pool(
            () =>
                spawn<TransformWorker>(new Worker('../../../reCli/workers/transform'), {
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
                        await worker.init({
                            config: run.config,
                            presetIndex,
                            tmpSource,
                            tmpDraft,
                            output: threadOutput,
                            fileMetaMap,
                            connectorData,
                            tocIndex,
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
                            await cachedMkdir(path.dirname(targetPath));
                            await fs.promises.rename(sourcePath, targetPath);
                        },
                        {concurrency: CONCURRENCY},
                    );
                }),
            );
            await Promise.all([
                fs.promises.rm(tmpThreads, {recursive: true}),
                fs.promises.rm(tmpDraft, {recursive: true}),
            ]);
        } finally {
            await transformPool.terminate(true);
        }

        await pMap(
            Array.from(writeConflicts.entries()),
            async ([relTarget, data]) => {
                logger.warn(relTarget, `Override ${relTarget}`);
                const targetFilename = path.join(output, relTarget);
                await cachedMkdir(path.dirname(targetFilename));
                await fs.promises.writeFile(targetFilename, data);
            },
            {concurrency: CONCURRENCY},
        );

        if (singlePage) {
            await saveSinglePages({
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
    } catch (error) {
        run.logger.error(error);
    } finally {
        processLogs(run.input);
    }
}

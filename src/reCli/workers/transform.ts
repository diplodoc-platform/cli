import pMap from 'p-map';
import {CONCURRENCY} from '../constants';
import {FileMetaMap} from '../types';
// @ts-ignore
import {expose} from 'threads';
import GithubConnector from '../components/vcs/github';
import assert from 'node:assert';
import {BuildConfig} from '~/commands/build';
import {Run} from '~/commands/build/run';
import {PresetIndex} from '~/reCli/components/presets/types';
import {TocIndexMap} from '~/reCli/components/toc/types';
import {logger} from '~/utils/logger';
import {SinglePageResult} from '~/models';
import {readTransformLog} from '~/reCli/utils/legacy';
import {lintPage} from '~/reCli/components/lint/lint';
import {transformPage} from '~/reCli/components/transform/transform';

/*eslint-disable no-console*/

export type TransformWorker = {
    run: typeof run;
    init: typeof init;
};

export interface TransformWorkerInitProps {
    config: BuildConfig;
    presetIndex: PresetIndex;
    tmpSource: string;
    tmpDraft: string;
    output: string;
    fileMetaMap: FileMetaMap;
    connectorData?: ReturnType<GithubConnector['serialize']>;
    tocIndex: TocIndexMap;
}

let workerEnv: WorkerEnv | null = null;

class WorkerEnv {
    options;
    presetIndex;
    tmpSource;
    tmpDraft;
    output;
    fileMetaMap;
    tocIndex;
    vcsConnector;
    logger;
    run;

    constructor({
        config,
        presetIndex,
        tmpSource,
        tmpDraft,
        output,
        fileMetaMap,
        connectorData,
        tocIndex,
    }: TransformWorkerInitProps) {
        this.run = new Run(config);
        this.options = config;
        this.presetIndex = presetIndex;
        this.tmpSource = tmpSource;
        this.tmpDraft = tmpDraft;
        this.output = output;
        this.fileMetaMap = fileMetaMap;
        this.tocIndex = tocIndex;

        if (connectorData) {
            this.vcsConnector = new GithubConnector({
                options: config,
                cwd: tmpSource,
                logger,
                run: this.run,
            });
            this.vcsConnector.deserialize(connectorData);
        }

        this.logger = logger;
    }
}

async function init(props: TransformWorkerInitProps) {
    workerEnv = new WorkerEnv(props);
}

export interface TransformWorkerProps {
    pages: string[];
}

async function run({pages}: TransformWorkerProps) {
    assert(workerEnv);

    const {
        run,
        logger,
        options,
        presetIndex,
        tmpSource,
        tmpDraft,
        output,
        fileMetaMap,
        tocIndex,
        vcsConnector,
    } = workerEnv;

    const writeConflicts = new Map<string, string>();
    const singlePageTocPagesMap = options.singlePage ? new Map<string, SinglePageResult[]>() : null;
    await pMap(
        pages,
        async (pagePath) => {
            logger.info(`Page ${pagePath}`);
            if (!run.legacyConfig.lintDisabled) {
                try {
                    await lintPage(
                        {
                            options,
                            presetIndex,
                            cwd: tmpSource,
                            draftCwd: tmpDraft,
                            logger,
                            run,
                        },
                        pagePath,
                    );
                } catch (err) {
                    const error = err as Error;
                    logger.error(pagePath, `Lint page error ${pagePath}. Error: ${error.stack}`);
                }
            }

            if (!options.buildDisabled) {
                try {
                    await transformPage(
                        {
                            run,
                            options,
                            writeConflicts,
                            singlePageTocPagesMap,
                            presetIndex,
                            cwd: tmpSource,
                            targetCwd: output,
                            fileMetaMap,
                            vcsConnector,
                            tocIndex,
                            logger,
                        },
                        pagePath,
                    );
                } catch (err) {
                    const error = err as Error;
                    logger.error(
                        pagePath,
                        `Transform page error ${pagePath}. Error: ${error.stack}`,
                    );
                }
            }

            readTransformLog();
        },
        {concurrency: CONCURRENCY},
    );
    return {
        writeConflicts,
        singlePageTocPagesMap,
    };
}

expose({
    init,
    run,
});

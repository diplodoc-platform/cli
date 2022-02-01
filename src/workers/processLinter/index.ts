import log from '@doc-tools/transform/lib/log';
import {extname} from 'path';
import {Observable, Subject} from 'threads/observable';

import {ArgvService, PluginService, PresetService, TocService} from '../../services';
import {TocServiceData} from '../../services/tocs';
import {PresetStorage} from '../../services/preset';
import {YfmArgv} from '../../models';
import {lintPage} from '../../resolvers';

let processedPages = new Subject();

interface ProcessLinterWorkerOptions {
    argvConfig: YfmArgv;
    navigationPaths: TocServiceData['navigationPaths'];
    presetStorage: PresetStorage;
}

async function run({
    argvConfig,
    presetStorage,
    navigationPaths,
}: ProcessLinterWorkerOptions) {
    ArgvService.set(argvConfig);
    PresetService.setPresetStorage(presetStorage);
    TocService.setNavigationPaths(navigationPaths);
    PluginService.setPlugins();

    TocService.getNavigationPaths().forEach((pathToFile) => {
        lintPage({
            inputPath: pathToFile,
            fileExtension: extname(pathToFile),
            onFinish: () => {
                processedPages.next(pathToFile);
            },
        });
    });
}

async function finish() {
    processedPages.complete();
    processedPages = new Subject();

    return log.get();
}

function getProcessedPages() {
    return Observable.from(processedPages);
}


export const processLinterWorker = {
    run,
    finish,
    getProcessedPages,
};

export type ProcessLinterWorker = typeof processLinterWorker;

import log from '@diplodoc/transform/lib/log';
import {extname} from 'path';
import {Observable, Subject} from 'threads/observable';
import {expose} from 'threads';

import {ArgvService, PluginService, PresetService} from '../../services';
import {PresetStorage} from '../../services/preset';
import {YfmArgv} from '../../models';
import {lintPage} from '../../resolvers';

let processedPages = new Subject();

interface ProcessLinterWorkerOptions {
    argvConfig: YfmArgv;
    navigationPaths: NormalizedPath[];
    presetStorage: PresetStorage;
}

async function run({argvConfig, presetStorage, navigationPaths}: ProcessLinterWorkerOptions) {
    ArgvService.set(argvConfig);
    PresetService.setPresetStorage(presetStorage);
    PluginService.setPlugins();

    navigationPaths.forEach((pathToFile) => {
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

export type ProcessLinterWorker = {
    run: typeof run;
    finish: typeof finish;
    getProcessedPages: typeof getProcessedPages;
};

expose({
    run,
    finish,
    getProcessedPages,
});

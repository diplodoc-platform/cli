import {SinglePageResult, YfmArgv} from '../../models';
import {TocServiceDataDump} from '../../services/tocs';
import {PresetStorageDump} from '../../services/preset';
import {VCSConnector, VCSConnectorDump} from '../../vcs-connector/connector-models';
import {ArgvService, PluginService, PresetService, TocService} from '../../services';
import {createVCSConnector} from '../../vcs-connector';
import {Observable, Subject} from 'threads/observable';
import {MainBridge, ReceivePayload, SendPayload} from '../mainBridge';
import {expose} from 'threads';
import {asyncify, mapLimit} from 'async';
import {lintPage} from '../../resolvers';
import {extname} from 'path';
import log from '@diplodoc/transform/lib/log';
import {processPage} from '../../resolvers/processPage';
import {LINTING_FINISHED, PROCESSING_FINISHED} from '../../constants';

const concurrency = 500;

export type PoolSubjectPayload = {type: 'path'; path: string; message: string} | SendPayload;

let subject = new Subject<PoolSubjectPayload>();

const singlePageResults: Record<string, SinglePageResult[]> = {};
let vcsConnector: VCSConnector | undefined;

const mainBridge = new MainBridge((payload) => subject.next(payload));

interface ProcessPoolWorkerOptions {
    argvConfig: YfmArgv;
    presetStorageDump: PresetStorageDump;
    tocServiceDataDump: TocServiceDataDump;
    vcsConnectorDump?: VCSConnectorDump;
}

async function init({
    argvConfig,
    vcsConnectorDump,
    tocServiceDataDump,
    presetStorageDump,
}: ProcessPoolWorkerOptions) {
    ArgvService.set(argvConfig);
    PresetService.load(presetStorageDump);
    TocService.load(tocServiceDataDump);

    vcsConnector = createVCSConnector();
    if (vcsConnectorDump && vcsConnector) {
        vcsConnector.load(vcsConnectorDump);
        vcsConnector.getUserByLogin = mainBridge.createFn<typeof vcsConnector.getUserByLogin>(
            'vcsConnector.getUserByLogin',
        );
    }

    PluginService.setPlugins();
}

interface LintProps {
    navigationPaths: string[];
}

async function lint({navigationPaths}: LintProps) {
    await mapLimit(
        navigationPaths,
        concurrency,
        asyncify(async (pathToFile: string) => {
            await lintPage({
                inputPath: pathToFile,
                fileExtension: extname(pathToFile),
                onFinish: () => {
                    subject.next({type: 'path', path: pathToFile, message: LINTING_FINISHED});
                },
            });
        }),
    );
}

interface TransformProps {
    navigationPaths: string[];
}

async function transform({navigationPaths}: TransformProps) {
    const singlePagePaths: Record<string, Set<string>> = {};

    await mapLimit(
        navigationPaths,
        concurrency,
        asyncify(async (pathToFile: string) => {
            await processPage({
                pathToFile,
                vcsConnector,
                singlePageResults,
                singlePagePaths,
            }).finally(() => {
                subject.next({type: 'path', path: pathToFile, message: PROCESSING_FINISHED});
            });
        }),
    );
}

async function finish() {
    subject.complete();
    subject = new Subject();

    return {logs: log.get(), singlePageResults};
}

function getSubject() {
    return Observable.from(subject);
}

function reply(id: number, payload: ReceivePayload) {
    mainBridge.handleReply(id, payload);
}

export type ProcessPoolWorker = {
    init: typeof init;
    lint: typeof lint;
    transform: typeof transform;
    getSubject: typeof getSubject;
    reply: typeof reply;
    finish: typeof finish;
};

expose({
    init,
    lint,
    transform,
    getSubject,
    reply,
    finish,
});

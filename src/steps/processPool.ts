import {ModuleThread, Pool, spawn, Thread, Worker} from 'threads';
import {ProcessPoolWorker} from '../workers/pool';
import {ArgvService, PresetService, TocService} from '../services';
import {WORKERS_COUNT} from '../constants';
import {VCSConnector} from '../vcs-connector/connector-models';
import log from '@diplodoc/transform/lib/log';
import {SinglePageResult} from '../models';
import {logger} from '../utils';
import {MainBridge} from '../workers/mainBridge';

const poolEnv = {
    singlePageResults: {} as Record<string, SinglePageResult[]>,
};

const workers: (ProcessPoolWorker & Thread)[] = [];
let pool: Pool<ModuleThread<ProcessPoolWorker>> | undefined;

interface InitProcessPoolProps {
    vcsConnector?: VCSConnector;
}

export async function initProcessPool({vcsConnector}: InitProcessPoolProps) {
    const argvConfig = ArgvService.getConfig();
    const presetStorageDump = PresetService.dump();
    const tocServiceDataDump = TocService.dump();
    const vcsConnectorDump = vcsConnector?.dump();

    const scope = {
        vcsConnector: vcsConnector,
    };

    // eslint-disable-next-line new-cap
    pool = Pool(async () => {
        const worker = await spawn<ProcessPoolWorker>(new Worker('./pool'), {timeout: 60000});
        await worker.init({
            argvConfig,
            presetStorageDump,
            tocServiceDataDump,
            vcsConnectorDump,
        });
        worker.getSubject().subscribe(async (payload) => {
            switch (payload.type) {
                case 'path': {
                    logger.info(payload.path, payload.message);
                    break;
                }
                case 'call': {
                    await MainBridge.handleCall(worker, payload, scope);
                    break;
                }
            }
        });
        workers.push(worker);
        return worker;
    }, WORKERS_COUNT);
}

export async function runPool(type: 'lint' | 'transform', navigationPaths: string[]) {
    if (!pool) {
        throw new Error('Pool is not initiated');
    }

    return pool.queue(async (worker) => {
        if (type === 'lint') {
            await worker.lint({navigationPaths});
        } else {
            await worker.transform({navigationPaths});
        }
    });
}

export async function finishProcessPool() {
    await Promise.all(
        workers.map(async (worker) => {
            const {logs, singlePageResults: singlePageResultsLocal} = await worker.finish();

            Object.entries(singlePageResultsLocal).forEach(([key, values]) => {
                let arr = poolEnv.singlePageResults[key];
                if (!arr) {
                    arr = poolEnv.singlePageResults[key] = [];
                }
                arr.push(...values);
            });

            log.add(logs);
        }),
    );
}

export async function terminateProcessPool() {
    if (!pool) {
        throw new Error('Pool is not initiated');
    }

    workers.splice(0);
    await pool.terminate(true);
    pool = undefined;
}

export function getPoolEnv() {
    return poolEnv;
}

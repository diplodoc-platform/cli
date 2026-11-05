import {createExternalSearchApi} from './runtime';

const worker = globalThis as unknown as {
    config: Parameters<typeof createExternalSearchApi>[0];
    api: ReturnType<typeof createExternalSearchApi>;
};

worker.api = createExternalSearchApi(worker.config);

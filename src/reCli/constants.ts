export const CONCURRENCY = 512;

export const WORKER_COUNT = process.env.WORKERS_COUNT || 8;

export enum WorkerDataType {
    Search = 'search',
}

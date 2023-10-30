import {MIN_CHUNK_SIZE, THREAD_PART_COUNT, WORKERS_COUNT} from '../constants';

export function getChunkSize(arr: string[]) {
    return Math.max(Math.ceil(arr.length / WORKERS_COUNT / THREAD_PART_COUNT), MIN_CHUNK_SIZE);
}

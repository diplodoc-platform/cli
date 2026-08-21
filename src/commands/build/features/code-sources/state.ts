import type {Run} from '~/commands/build';
import type {ResolvedSource} from './types';

import {join} from 'node:path';

/**
 * Written into the download directory once a ref has been resolved.
 *
 * This is the handshake between threads: only the main thread resolves refs, and
 * workers read the commit back from here rather than repeating the request.
 */
export type SourceState = {
    url: string;
    ref: string;
    path: string;
    commit: string;
};

const STATE_FILE = '.diplodoc-source.json';

export async function readState(run: Run, source: ResolvedSource): Promise<SourceState | null> {
    try {
        const raw = await run.fs.readFile(join(source.base, STATE_FILE), 'utf8');
        const state = JSON.parse(raw as string) as SourceState;

        // The directory name already encodes these, but a leftover or
        // hand-edited one should not be trusted to describe itself correctly.
        if (state.url === source.url && state.ref === source.ref && state.path === source.prefix) {
            return state;
        }

        return null;
    } catch {
        return null;
    }
}

export async function writeState(run: Run, source: ResolvedSource, commit: string) {
    const state: SourceState = {
        url: source.url as string,
        ref: source.ref as string,
        path: source.prefix,
        commit,
    };

    await run.fs.mkdir(source.base, {recursive: true});
    await run.fs.writeFile(join(source.base, STATE_FILE), JSON.stringify(state), 'utf8');
}

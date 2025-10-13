import {Session} from 'node:inspector/promises';
import {isMainThread, threadId} from 'node:worker_threads';
import {writeFile} from 'node:fs/promises';

export async function profile() {
    const name = isMainThread ? `profile-main` : `profile-thread-${threadId}`;
    const session = new Session();
    session.connect();

    await session.post('Profiler.enable');
    await session.post('Profiler.setSamplingInterval', {interval: 100});
    await session.post('Profiler.start');

    return {
        async stop() {
            const {profile} = await session.post('Profiler.stop');
            await writeFile(`./profile.cpuprofile-${name}.json`, JSON.stringify(profile));
        },
    };
}

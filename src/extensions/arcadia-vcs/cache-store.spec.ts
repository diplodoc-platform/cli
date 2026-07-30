import type {ArcadiaVcsCache} from './types';
import type {Server} from 'node:http';

import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach, describe, expect, it, vi} from 'vitest';

import {ArcadiaVcsCacheStore} from './cache-store';

const CACHE: ArcadiaVcsCache = {
    version: 1,
    revision: 'cached-revision',
    scopes: ['travel/docs'],
    mtimes: {'travel/docs/index.md': 1},
    authors: {},
    contributors: {},
};

const tempDirectories: string[] = [];
const servers: Server[] = [];
const AUTH_ENV = 'ARCADIA_VCS_CACHE_TEST_TOKEN';

async function makeTempDirectory() {
    const directory = (await mkdtemp(join(tmpdir(), 'arcadia-vcs-cache-'))) as AbsolutePath;
    tempDirectories.push(directory);
    return directory;
}

afterEach(async () => {
    delete process.env[AUTH_ENV];
    await Promise.all(
        servers
            .splice(0)
            .map(
                (server) =>
                    new Promise<void>((resolve, reject) =>
                        server.close((error) => (error ? reject(error) : resolve())),
                    ),
            ),
    );
    await Promise.all(
        tempDirectories.splice(0).map((directory) => rm(directory, {recursive: true})),
    );
});

describe('ArcadiaVcsCacheStore', () => {
    it('should load a valid cache from a seed file relative to the config directory', async () => {
        const root = await makeTempDirectory();
        await writeFile(join(root, 'seed.json'), JSON.stringify(CACHE));
        const store = new ArcadiaVcsCacheStore({seed: 'seed.json'}, root, root);

        await expect(store.load()).resolves.toEqual(CACHE);
    });

    it('should prefer a cache from the configured source URL over the seed', async () => {
        const root = await makeTempDirectory();
        await writeFile(join(root, 'seed.json'), JSON.stringify(CACHE));
        const remoteCache = {...CACHE, revision: 'remote-revision'};
        const server = createServer((_request, response) => {
            response.setHeader('content-type', 'application/json');
            response.end(JSON.stringify(remoteCache));
        });
        servers.push(server);
        await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
        const address = server.address();
        if (!address || typeof address === 'string') {
            throw new Error('Test server did not expose a TCP address.');
        }
        const store = new ArcadiaVcsCacheStore(
            {source: `http://127.0.0.1:${address.port}/vcs-cache.json`, seed: 'seed.json'},
            root,
            root,
        );

        await expect(store.load()).resolves.toEqual(remoteCache);
    });

    it('should save the updated cache under the build output', async () => {
        const root = await makeTempDirectory();
        const output = join(root, 'build') as AbsolutePath;
        const store = new ArcadiaVcsCacheStore({output: 'metadata/vcs-cache.json'}, root, output);

        await store.save(CACHE);

        await expect(readFile(join(output, 'metadata/vcs-cache.json'), 'utf8')).resolves.toBe(
            `${JSON.stringify(CACHE, null, 2)}\n`,
        );
    });

    it('should authorize the source request with an OAuth token from the configured env', async () => {
        const root = await makeTempDirectory();
        await writeFile(join(root, 'seed.json'), JSON.stringify(CACHE));
        process.env[AUTH_ENV] = 'secret-token';
        const remoteCache = {...CACHE, revision: 'authorized-remote-revision'};
        const server = createServer((request, response) => {
            if (request.headers.authorization !== 'OAuth secret-token') {
                response.writeHead(401).end();
                return;
            }
            response.setHeader('content-type', 'application/json');
            response.end(JSON.stringify(remoteCache));
        });
        servers.push(server);
        await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
        const address = server.address();
        if (!address || typeof address === 'string') {
            throw new Error('Test server did not expose a TCP address.');
        }
        const store = new ArcadiaVcsCacheStore(
            {
                source: `http://127.0.0.1:${address.port}/vcs-cache.json`,
                seed: 'seed.json',
                authEnv: AUTH_ENV,
            },
            root,
            root,
        );

        await expect(store.load()).resolves.toEqual(remoteCache);
    });

    it('should warn and fall back to the seed when the source is unavailable', async () => {
        const root = await makeTempDirectory();
        await writeFile(join(root, 'seed.json'), JSON.stringify(CACHE));
        const server = createServer((_request, response) => response.writeHead(503).end());
        servers.push(server);
        await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
        const address = server.address();
        if (!address || typeof address === 'string') {
            throw new Error('Test server did not expose a TCP address.');
        }
        const warn = vi.fn();
        const store = new ArcadiaVcsCacheStore(
            {source: `http://127.0.0.1:${address.port}/vcs-cache.json`, seed: 'seed.json'},
            root,
            root,
            warn,
        );

        await expect(store.load()).resolves.toEqual(CACHE);
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('503'));
    });

    it('should reject invalid metadata values from the source and use the seed', async () => {
        const root = await makeTempDirectory();
        await writeFile(join(root, 'seed.json'), JSON.stringify(CACHE));
        const server = createServer((_request, response) => {
            response.end(JSON.stringify({...CACHE, mtimes: {'index.md': 'not-a-timestamp'}}));
        });
        servers.push(server);
        await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
        const address = server.address();
        if (!address || typeof address === 'string') {
            throw new Error('Test server did not expose a TCP address.');
        }
        const warn = vi.fn();
        const store = new ArcadiaVcsCacheStore(
            {source: `http://127.0.0.1:${address.port}/vcs-cache.json`, seed: 'seed.json'},
            root,
            root,
            warn,
        );

        await expect(store.load()).resolves.toEqual(CACHE);
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('Invalid Arcadia VCS cache'));
    });

    it('should treat a missing seed as a cache miss', async () => {
        const root = await makeTempDirectory();
        const warn = vi.fn();
        const store = new ArcadiaVcsCacheStore({seed: 'missing.json'}, root, root, warn);

        await expect(store.load()).resolves.toBeUndefined();
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('Cannot load Arcadia VCS seed'));
    });
});

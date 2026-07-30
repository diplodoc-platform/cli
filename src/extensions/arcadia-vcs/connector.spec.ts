import type {Run} from '@diplodoc/cli/lib/run';
import type {Config} from './types';

import {afterEach, describe, expect, it, vi} from 'vitest';

import {configPath} from '@diplodoc/cli/lib/config';

import {ArcClient} from './arc-client';
import {ArcadiaVcsConnector} from './connector';

describe('ArcadiaVcsConnector', () => {
    afterEach(() => vi.restoreAllMocks());

    it('should log warning if error code is ENOENT and return "." from getBase()', async () => {
        const error = new Error('spawn arc ENOENT');
        error.code = 'ENOENT';
        const warn = vi.fn();

        const run = {
            config: {
                [configPath]: '/testpath/.yfm',
                mtimes: {enabled: true},
                authors: {enabled: true},
                contributors: {enabled: true},
            },
            logger: {warn},
        } as unknown as Run<Config>;

        const connector = new ArcadiaVcsConnector(run);

        // @ts-ignore
        connector.fillMTimes = vi.fn().mockRejectedValue(error);

        await connector.init();

        expect(warn).toHaveBeenCalledWith(
            'Arcadia VCS extension disabled: arc is not available in this environment.',
        );
        expect(await connector.getBase()).toBe('.');
    });

    it('should not call warn if error code is not ENOENT', async () => {
        const error = new Error('ERROR');
        error.code = 'ERROR';
        const warn = vi.fn();

        const run = {
            config: {
                [configPath]: '/testpath/.yfm',
                mtimes: {enabled: true},
                authors: {enabled: true},
                contributors: {enabled: true},
            },
            logger: {warn},
        } as unknown as Run<Config>;

        const connector = new ArcadiaVcsConnector(run);

        // @ts-ignore
        connector.fillMTimes = vi.fn().mockRejectedValue(error);

        await expect(connector.init()).rejects.toThrow('ERROR');

        expect(warn).not.toHaveBeenCalled();
    });

    it('should persist the updated incremental cache after the build', async () => {
        const run = {
            input: '/testpath',
            output: '/testpath/build',
            config: {
                [configPath]: '/testpath/.yfm',
                vcs: {cache: {seed: '.vcs-cache.seed.json'}},
                mtimes: {enabled: true},
                authors: {enabled: false},
                contributors: {enabled: false},
            },
            logger: {warn: vi.fn()},
        } as unknown as Run<Config>;
        const connector = new ArcadiaVcsConnector(run);
        const cache = {
            version: 1 as const,
            revision: 'current',
            scopes: ['travel/docs'],
            mtimes: {},
            authors: {},
            contributors: {},
        };
        const save = vi.fn();
        Object.assign(connector, {
            arc: {getCache: vi.fn().mockResolvedValue(cache)},
            cacheStore: {save},
            cacheReady: true,
        });

        await connector.flushCache();

        expect(save).toHaveBeenCalledWith(cache);
    });

    it('should use cached metadata without advancing the cache when incremental arc log fails', async () => {
        const warn = vi.fn();
        const run = {
            input: '/testpath',
            output: '/testpath/build',
            config: {
                [configPath]: '/testpath/.yfm',
                vcs: {cache: {seed: '.vcs-cache.seed.json'}},
                mtimes: {enabled: true},
                authors: {enabled: false},
                contributors: {enabled: false},
            },
            logger: {warn},
        } as unknown as Run<Config>;
        const cache = {
            version: 1 as const,
            revision: 'cached',
            scopes: ['testpath'],
            mtimes: {'testpath/index.md': 42},
            authors: {},
            contributors: {},
        };
        const save = vi.fn();
        const connector = new ArcadiaVcsConnector(run);
        Object.assign(connector, {cacheStore: {load: vi.fn().mockResolvedValue(cache), save}});
        vi.spyOn(ArcClient.prototype, 'getMTimes').mockRejectedValue(new Error('arc timeout'));

        await connector.init();
        await connector.flushCache();

        await expect(
            connector.getModifiedTimeByPath('testpath/index.md' as RelativePath),
        ).resolves.toBe(42);
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('cached VCS metadata'));
        expect(save).not.toHaveBeenCalled();
    });
});

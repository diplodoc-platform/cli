import type {Run} from '@diplodoc/cli/lib/run';
import type {Config} from './types';

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {configPath} from '@diplodoc/cli/lib/config';

import {ArcClient} from './arc-client';
import {ArcadiaVcsConnector} from './connector';

const thread = vi.hoisted(() => ({isMainThread: true}));

vi.mock('node:worker_threads', () => thread);

function createRun() {
    return {
        config: {
            [configPath]: '/testpath/.yfm',
            vcs: {enabled: true, scopes: []},
            mtimes: {enabled: true},
            authors: {enabled: true},
            contributors: {enabled: true},
        },
        logger: {warn: vi.fn()},
    } as unknown as Run<Config>;
}

describe('ArcadiaVcsConnector', () => {
    beforeEach(() => {
        vi.spyOn(ArcClient.prototype, 'getBase').mockResolvedValue('docs' as NormalizedPath);
        vi.spyOn(ArcClient.prototype, 'getMTimes').mockResolvedValue({});
        vi.spyOn(ArcClient.prototype, 'getAuthors').mockResolvedValue({});
        vi.spyOn(ArcClient.prototype, 'getContributors').mockResolvedValue({});
    });

    afterEach(() => {
        thread.isMainThread = true;
        vi.restoreAllMocks();
    });

    it('should log warning if error code is ENOENT and return "." from getBase()', async () => {
        const error = Object.assign(new Error('spawn arc ENOENT'), {code: 'ENOENT'});
        vi.mocked(ArcClient.prototype.getMTimes).mockRejectedValue(error);
        const run = createRun();
        const connector = new ArcadiaVcsConnector(run);

        await connector.init();

        expect(run.logger.warn).toHaveBeenCalledWith(
            'Arcadia VCS extension disabled: arc is not available in this environment.',
        );
        expect(await connector.getBase()).toBe('.');
    });

    it('should not call warn if error code is not ENOENT', async () => {
        const error = Object.assign(new Error('ERROR'), {code: 'ERROR'});
        vi.mocked(ArcClient.prototype.getMTimes).mockRejectedValue(error);
        const run = createRun();
        const connector = new ArcadiaVcsConnector(run);

        await expect(connector.init()).rejects.toThrow('ERROR');

        expect(run.logger.warn).not.toHaveBeenCalled();
    });

    it('should reuse the main thread data and base path without calling arc in a worker', async () => {
        vi.mocked(ArcClient.prototype.getMTimes).mockResolvedValue({'docs/page.md': 1735689600});
        vi.mocked(ArcClient.prototype.getAuthors).mockResolvedValue({
            'docs/page.md': {login: 'author', commit: 'first'},
        });
        vi.mocked(ArcClient.prototype.getContributors).mockResolvedValue({
            'docs/page.md': [{login: 'contributor', commit: 'last'}],
        });
        const main = new ArcadiaVcsConnector(createRun());
        await main.init();
        const data = main.getData();
        vi.clearAllMocks();

        thread.isMainThread = false;
        const worker = new ArcadiaVcsConnector(createRun());
        await worker.init();
        worker.setData(data);

        expect(await worker.getBase()).toBe('docs');
        expect(await worker.getModifiedTimeByPath('docs/page.md' as RelativePath)).toBe(1735689600);
        expect(await worker.getAuthorByPath('docs/page.md' as RelativePath)).toMatchObject({
            login: 'author',
        });
        expect(await worker.getContributorsByPath('docs/page.md' as RelativePath, [])).toEqual([
            expect.objectContaining({login: 'contributor'}),
        ]);
        expect(ArcClient.prototype.getBase).not.toHaveBeenCalled();
        expect(ArcClient.prototype.getMTimes).not.toHaveBeenCalled();
        expect(ArcClient.prototype.getAuthors).not.toHaveBeenCalled();
        expect(ArcClient.prototype.getContributors).not.toHaveBeenCalled();
    });
});

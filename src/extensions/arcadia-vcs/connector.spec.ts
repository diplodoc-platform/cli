import type {Run} from '@diplodoc/cli/lib/run';
import type {Config} from './types';

import {describe, expect, it, vi} from 'vitest';

import {configPath} from '@diplodoc/cli/lib/config';

import {ArcadiaVcsConnector} from './connector';

describe('ArcadiaVcsConnector', () => {
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

    describe('setData()', () => {
        it('should set arcAvailable to true so getBase() works in worker threads', async () => {
            const run = {
                config: {
                    [configPath]: '/testpath/.yfm',
                    mtimes: {enabled: true},
                    authors: {enabled: true},
                    contributors: {enabled: true},
                },
                logger: {warn: vi.fn()},
            } as unknown as Run<Config>;

            const connector = new ArcadiaVcsConnector(run);

            expect(await connector.getBase()).toBe('.');

            // @ts-ignore
            connector.arc.getBase = vi.fn().mockResolvedValue('monium/docs' as NormalizedPath);

            connector.setData({mtimes: {}, authors: {}, contributors: {}});

            expect(await connector.getBase()).toBe('monium/docs');
            // @ts-ignore
            expect(connector.arc.getBase).toHaveBeenCalledTimes(1);
        });
    });
});

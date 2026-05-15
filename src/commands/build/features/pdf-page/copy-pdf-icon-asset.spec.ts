import type {Run} from '~/commands/build';

import {join} from 'node:path';
import {describe, expect, it, vi} from 'vitest';

import {copyPdfIconAsset} from './copy-pdf-icon-asset';

const maxAssetSize = 10_000;

function makeRun(options: {
    pdf?: unknown;
    exists?: boolean;
    fileSize?: number;
    copyRejected?: boolean;
}): Run {
    const {pdf, exists = false, fileSize = 100, copyRejected = false} = options;

    const copy = vi.fn().mockImplementation(() => {
        if (copyRejected) {
            return Promise.reject(new Error('copy failed'));
        }

        return Promise.resolve();
    });

    const existsFn = vi.fn().mockReturnValue(exists);
    const statSync = vi.fn().mockReturnValue({size: fileSize});
    const logger = {
        copy: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    };

    return {
        input: '/project/input',
        output: '/project/output',
        config: {
            content: {maxAssetSize},
            ...(pdf === undefined ? {} : {pdf}),
        } as Run['config'],
        exists: existsFn,
        copy,
        fs: {statSync},
        logger,
    } as unknown as Run;
}

describe('copyPdfIconAsset', () => {
    it('does nothing when pdf is boolean', async () => {
        const run = makeRun({pdf: true});

        await copyPdfIconAsset(run);

        expect(run.copy).not.toHaveBeenCalled();
        expect(run.logger.copy).not.toHaveBeenCalled();
    });

    it('does nothing when icon is not under _assets/', async () => {
        const run = makeRun({
            pdf: {icon: '<svg></svg>'},
            exists: true,
        });

        await copyPdfIconAsset(run);

        expect(run.copy).not.toHaveBeenCalled();
    });

    it('does nothing when path is not a media link extension', async () => {
        const run = makeRun({
            pdf: {icon: '_assets/icon.woff2'},
            exists: true,
        });

        await copyPdfIconAsset(run);

        expect(run.exists).not.toHaveBeenCalled();
        expect(run.copy).not.toHaveBeenCalled();
    });

    it('does nothing when source file is missing', async () => {
        const run = makeRun({
            pdf: {icon: '_assets/icon.svg'},
            exists: false,
        });

        await copyPdfIconAsset(run);

        expect(run.exists).toHaveBeenCalledWith(join('/project/input', '_assets/icon.svg'));
        expect(run.copy).not.toHaveBeenCalled();
    });

    it('copies file and logs copy when asset exists and size is within limit', async () => {
        const run = makeRun({
            pdf: {icon: '_assets/icon.svg'},
            exists: true,
            fileSize: 50,
        });

        await copyPdfIconAsset(run);

        const from = join('/project/input', '_assets/icon.svg');
        const to = join('/project/output', '_assets/icon.svg');

        expect(run.fs.statSync).toHaveBeenCalledWith(from);
        expect(run.logger.copy).toHaveBeenCalledWith(from, to);
        expect(run.copy).toHaveBeenCalledWith(from, to);
        expect(run.logger.error).not.toHaveBeenCalled();
    });

    it('logs YFM013 when file exceeds max size but still copies', async () => {
        const run = makeRun({
            pdf: {icon: '_assets/icon.png'},
            exists: true,
            fileSize: maxAssetSize + 1,
        });

        await copyPdfIconAsset(run);

        expect(run.logger.error).toHaveBeenCalledWith(
            'YFM013',
            expect.stringContaining('YFM013 / File asset limit exceeded'),
        );
        expect(run.copy).toHaveBeenCalled();
    });

    it('logs warn when copy throws', async () => {
        const run = makeRun({
            pdf: {icon: '_assets/icon.pdf'},
            exists: true,
            copyRejected: true,
        });

        await copyPdfIconAsset(run);

        expect(run.logger.warn).toHaveBeenCalledWith(
            'Unable to copy pdf icon asset _assets/icon.pdf.',
            expect.any(Error),
        );
    });
});

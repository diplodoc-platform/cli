import type {BuildConfig} from '../..';

import {join} from 'node:path';
import {describe, expect, it, vi} from 'vitest';
import {when} from 'vitest-when';

import {setupRun} from '../../__tests__';
import {getHooks} from '../../hooks';
import {Build} from '../..';

import {PdfPage} from './index';

describe('PdfPage feature', () => {
    describe('AfterRun md: PdfPageIcon hook', () => {
        it('copies pdf icon asset when icon is configured under _assets/', async () => {
            const build = new Build();
            const feature = new PdfPage();
            feature.apply(build);

            const run = setupRun({
                content: {maxAssetSize: 1_000_000},
                pdf: {icon: '_assets/icons/pdf.svg'},
            } as unknown as BuildConfig);

            const assetPath = join(run.input, '_assets/icons/pdf.svg');

            when(run.exists).calledWith(assetPath).thenReturn(true);
            when(run.copy).calledWith(expect.anything(), expect.anything()).thenResolve();
            vi.spyOn(run.fs, 'statSync').mockReturnValue({size: 10} as ReturnType<
                typeof run.fs.statSync
            >);

            await getHooks(build).AfterRun.for('md').promise(run);

            expect(run.copy).toHaveBeenCalledWith(
                assetPath,
                join(run.output, '_assets/icons/pdf.svg'),
            );
        });

        it('copies pdf icon even when allowCustomResources is off', async () => {
            const build = new Build();
            const feature = new PdfPage();
            feature.apply(build);

            const run = setupRun({
                allowCustomResources: false,
                content: {maxAssetSize: 1_000_000},
                pdf: {icon: '_assets/icons/pdf.svg'},
            } as unknown as BuildConfig);

            const assetPath = join(run.input, '_assets/icons/pdf.svg');

            when(run.exists).calledWith(assetPath).thenReturn(true);
            when(run.copy).calledWith(expect.anything(), expect.anything()).thenResolve();
            vi.spyOn(run.fs, 'statSync').mockReturnValue({size: 10} as ReturnType<
                typeof run.fs.statSync
            >);

            await getHooks(build).AfterRun.for('md').promise(run);

            expect(run.copy).toHaveBeenCalledTimes(1);
            expect(run.copy).toHaveBeenCalledWith(
                assetPath,
                join(run.output, '_assets/icons/pdf.svg'),
            );
        });

        it('does not copy icon when pdf is not configured', async () => {
            const build = new Build();
            const feature = new PdfPage();
            feature.apply(build);

            const run = setupRun({
                content: {maxAssetSize: 1_000_000},
                resources: {style: [], script: []},
                pdf: {enabled: true},
            } as unknown as BuildConfig);

            await getHooks(build).AfterRun.for('md').promise(run);

            expect(run.copy).not.toHaveBeenCalled();
        });
    });
});

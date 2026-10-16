import type {AssetInfo} from '~/core/markdown/types';
import type {Run} from '../../..';

import {beforeEach, describe, expect, it, vi} from 'vitest';
import {replaceSvgContent} from '@diplodoc/transform/lib/plugins/images';

import {Scheduler} from '../utils';

import {mergeSvg} from './merge-svg';

vi.mock('@diplodoc/transform/lib/plugins/images', () => ({
    replaceSvgContent: vi.fn(() => '<svg/>'),
}));

describe('Markdown SVG entity limit forwarding', () => {
    beforeEach(() => {
        vi.mocked(replaceSvgContent).mockReset();
        vi.mocked(replaceSvgContent).mockReturnValue('<svg/>');
    });

    it.each([undefined, 0, 1024])(
        'forwards only an explicit limit: %s',
        async (svgMaxEntityCount) => {
            const run = {
                input: '/input',
                config: {
                    idGenerator: 'constant',
                    content: {maxInlineSvgSize: 1024, svgMaxEntityCount},
                },
                realpath: async (path: string) => path,
                read: async () => '<svg/>',
            } as unknown as Run;
            const assets: AssetInfo[] = [
                {
                    type: 'image',
                    hash: null,
                    search: null,
                    path: 'diagram.svg' as NormalizedPath,
                    title: 'Diagram',
                    autotitle: false,
                    location: [10, 21],
                    options: {width: null, height: null, title: null, inline: true},
                },
            ];
            const scheduler = new Scheduler([mergeSvg(run, new Map(), assets)]);
            await scheduler.schedule('index.md' as NormalizedPath);
            await scheduler.process('![Diagram](diagram.svg)');
            const options = vi.mocked(replaceSvgContent).mock.calls[0][1];
            if (svgMaxEntityCount === undefined) {
                expect(options).not.toHaveProperty('svgMaxEntityCount');
            } else {
                expect(options).toHaveProperty('svgMaxEntityCount', svgMaxEntityCount);
            }
        },
    );
    it('retains the original image when the shared helper cannot inline it', async () => {
        vi.mocked(replaceSvgContent).mockReturnValue('');
        const logger = {info: vi.fn(), warn: vi.fn(), error: vi.fn()};
        const run = {
            input: '/input',
            config: {idGenerator: 'constant', content: {maxInlineSvgSize: 1024}},
            realpath: async (path: string) => path,
            read: async () => '<svg/>',
            logger,
        } as unknown as Run;
        const assets: AssetInfo[] = [
            {
                type: 'image',
                hash: null,
                search: null,
                path: 'diagram.svg' as NormalizedPath,
                title: 'Diagram',
                autotitle: false,
                location: [10, 21],
                options: {width: null, height: null, title: null, inline: true},
            },
        ];
        const scheduler = new Scheduler([mergeSvg(run, new Map(), assets)]);
        await scheduler.schedule('index.md' as NormalizedPath);
        const content = '![Diagram](diagram.svg)';
        await expect(scheduler.process(content)).resolves.toBe(content);
        expect(replaceSvgContent).toHaveBeenCalledWith(
            '<svg/>',
            expect.objectContaining({path: 'diagram.svg', log: logger}),
            expect.any(Function),
        );
        expect(logger.warn).not.toHaveBeenCalled();
    });
});

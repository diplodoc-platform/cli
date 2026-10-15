import {describe, expect, it, vi} from 'vitest';

import {Run} from './run';

describe('Transform SVG entity limit forwarding', () => {
    it.each([undefined, 0, 1024])('forwards only an explicit limit: %s', (svgMaxEntityCount) => {
        const run = {
            config: {
                langs: ['en'],
                idGenerator: 'constant',
                content: {maxInlineSvgSize: 1024, svgMaxEntityCount},
            },
            markdown: {plugins: []},
            toc: {entrySet: new Set()},
            getEntries: () => [],
            anchors: {resolve: vi.fn()},
        } as unknown as Run;
        const options = Run.prototype['transformConfig'].call(
            run,
            'en/index.md' as NormalizedPath,
            {},
        );

        if (svgMaxEntityCount === undefined) {
            expect(options).not.toHaveProperty('svgMaxEntityCount');
        } else {
            expect(options).toHaveProperty('svgMaxEntityCount', svgMaxEntityCount);
        }
    });
});

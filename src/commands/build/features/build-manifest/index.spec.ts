import {describe, expect, it} from 'vitest';

import {BuildManifest} from './index';

describe('Build manifest feature', () => {
    describe('shouldReplaceFile method', () => {
        it('should prioritize .md files over .yaml files', () => {
            const buildManifest = new BuildManifest();
            // @ts-ignore - accessing private method for testing
            const shouldReplace = buildManifest.shouldReplaceFile('.yaml', '.md');

            expect(shouldReplace).toBe(true);
        });

        it('should prioritize .md files over .yml files', () => {
            const buildManifest = new BuildManifest();
            // @ts-ignore - accessing private method for testing
            const shouldReplace = buildManifest.shouldReplaceFile('.yml', '.md');

            expect(shouldReplace).toBe(true);
        });

        it('should prioritize .yaml files over .html files', () => {
            const buildManifest = new BuildManifest();
            // @ts-ignore - accessing private method for testing
            const shouldReplace = buildManifest.shouldReplaceFile('.html', '.yaml');

            expect(shouldReplace).toBe(true);
        });

        it('should prioritize .yml files over .html files', () => {
            const buildManifest = new BuildManifest();
            // @ts-ignore - accessing private method for testing
            const shouldReplace = buildManifest.shouldReplaceFile('.html', '.yml');

            expect(shouldReplace).toBe(true);
        });

        it('should not replace when new file has lower priority', () => {
            const buildManifest = new BuildManifest();
            // @ts-ignore - accessing private method for testing
            const shouldReplace = buildManifest.shouldReplaceFile('.md', '.yaml');

            expect(shouldReplace).toBe(false);
        });

        it('should handle unknown extensions with priority 0', () => {
            const buildManifest = new BuildManifest();
            // @ts-ignore - accessing private method for testing
            const shouldReplace = buildManifest.shouldReplaceFile('.unknown', '.custom');

            expect(shouldReplace).toBe(false);
        });
    });
});

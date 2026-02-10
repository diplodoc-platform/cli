import {describe, expect, it} from 'vitest';

import {isStaticAssetPath} from './links';

describe('links plugin', () => {
    describe('isStaticAssetPath', () => {
        it('should return true for paths starting with _assets/', () => {
            expect(isStaticAssetPath('_assets/file.yaml')).toBe(true);
            expect(isStaticAssetPath('_assets/config.json')).toBe(true);
            expect(isStaticAssetPath('_assets/nested/file.txt')).toBe(true);
        });

        it('should return true for paths containing /_assets/', () => {
            expect(isStaticAssetPath('folder/_assets/file.yaml')).toBe(true);
            expect(isStaticAssetPath('docs/_assets/config.json')).toBe(true);
            expect(isStaticAssetPath('deep/nested/_assets/file.txt')).toBe(true);
        });

        it('should return false for paths with similar but different folder names', () => {
            expect(isStaticAssetPath('some_assets/file.yaml')).toBe(false);
            expect(isStaticAssetPath('my_assets_folder/file.yaml')).toBe(false);
            expect(isStaticAssetPath('_assets_backup/file.yaml')).toBe(false);
            expect(isStaticAssetPath('folder/some_assets/file.yaml')).toBe(false);
        });

        it('should return false for regular file paths', () => {
            expect(isStaticAssetPath('folder/file.md')).toBe(false);
            expect(isStaticAssetPath('images/photo.png')).toBe(false);
            expect(isStaticAssetPath('docs/index.yaml')).toBe(false);
        });

        it('should return false for paths where _assets is a file name', () => {
            expect(isStaticAssetPath('folder/_assets')).toBe(false);
            expect(isStaticAssetPath('_assets')).toBe(false);
        });
    });
});

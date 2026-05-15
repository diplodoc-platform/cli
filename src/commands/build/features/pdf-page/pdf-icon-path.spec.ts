import {describe, expect, it} from 'vitest';

import {getPdfIconAssetPath} from './pdf-icon-path';

describe('getPdfIconAssetPath', () => {
    it('returns undefined when pdf is boolean', () => {
        expect(getPdfIconAssetPath({pdf: true})).toBeUndefined();
    });

    it('returns undefined for inline SVG string', () => {
        expect(
            getPdfIconAssetPath({pdf: {icon: '<svg xmlns="http://www.w3.org/2000/svg"/>'}}),
        ).toBeUndefined();
    });

    it('returns undefined when icon does not start with _assets/', () => {
        expect(getPdfIconAssetPath({pdf: {icon: '/static/icon.svg'}})).toBeUndefined();
    });

    it('returns undefined for _assets without trailing slash', () => {
        expect(getPdfIconAssetPath({pdf: {icon: '_assetsX/icon.svg'}})).toBeUndefined();
        expect(getPdfIconAssetPath({pdf: {icon: '_assets-backup/leaked.png'}})).toBeUndefined();
    });

    it('returns normalized path for _assets/ file', () => {
        expect(getPdfIconAssetPath({pdf: {icon: '_assets/icons/pdf.svg'}})).toBe(
            '_assets/icons/pdf.svg',
        );
    });

    it('strips query and hash', () => {
        expect(getPdfIconAssetPath({pdf: {icon: '_assets/icons/pdf.svg?v=1#frag'}})).toBe(
            '_assets/icons/pdf.svg',
        );
    });

    it('returns undefined when path escapes with ..', () => {
        expect(getPdfIconAssetPath({pdf: {icon: '_assets/../secret.svg'}})).toBeUndefined();
    });
});

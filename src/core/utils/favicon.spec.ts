import {describe, expect, it} from 'vitest';
import {getFaviconType} from './favicon';

describe('getFaviconType', () => {
    it('should return svg type for .svg', () => {
        expect(getFaviconType('favicon.svg')).toBe('image/svg+xml');
    });

    it('should return png type for .png', () => {
        expect(getFaviconType('favicon.png')).toBe('image/png');
    });

    it('should return ico type for .ico', () => {
        expect(getFaviconType('favicon.ico')).toBe('image/x-icon');
    });

    it('should return jpeg type for .jpg', () => {
        expect(getFaviconType('favicon.jpg')).toBe('image/jpeg');
    });

    it('should return jpeg type for .jpeg', () => {
        expect(getFaviconType('favicon.jpeg')).toBe('image/jpeg');
    });

    it('should handle uppercase extensions', () => {
        expect(getFaviconType('favicon.SVG')).toBe('image/svg+xml');
        expect(getFaviconType('favicon.PNG')).toBe('image/png');
        expect(getFaviconType('favicon.ICO')).toBe('image/x-icon');
        expect(getFaviconType('favicon.JPG')).toBe('image/jpeg');
        expect(getFaviconType('favicon.JPEG')).toBe('image/jpeg');
    });

    it('should return undefined for unknown extensions', () => {
        expect(getFaviconType('favicon.bmp')).toBeUndefined();
        expect(getFaviconType('favicon.tiff')).toBeUndefined();
        expect(getFaviconType('favicon')).toBeUndefined();
        expect(getFaviconType('.gitignore')).toBeUndefined();
    });

    it('should return undefined for empty input', () => {
        expect(getFaviconType('')).toBeUndefined();
        expect(getFaviconType(null as unknown as string)).toBeUndefined();
        expect(getFaviconType(undefined as unknown as string)).toBeUndefined();
    });

    it('should handle full urls', () => {
        expect(getFaviconType('https://cdn.site.com/favicon.ico')).toBe('image/x-icon');
    });
});

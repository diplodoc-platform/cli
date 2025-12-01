/**
 * Detects MIME type for favicon based on file extension.
 *
 * Supports common favicon formats: SVG, PNG, ICO, JPG/JPEG.
 * Handles URLs with query parameters or fragments by extracting clean extension.
 *
 * @param faviconSrc - Favicon file path or URL
 * @returns MIME type string (e.g., 'image/svg+xml') or undefined if extension is unknown/empty
 *
 * @example
 * ```typescript
 * getFaviconType('favicon.ico') // 'image/x-icon'
 * getFaviconType('favicon.png?v=123') // 'image/png'
 * getFaviconType('unknown.bmp') // undefined
 * ```
 */
export function getFaviconType(faviconSrc: string): string | undefined {
    if (!faviconSrc) {
        return undefined;
    }

    const cleanSrc = faviconSrc.split(/[?#]/)[0];

    const ext = cleanSrc.split('.').pop()?.toLowerCase();

    switch (ext) {
        case 'svg':
            return 'image/svg+xml';
        case 'png':
            return 'image/png';
        case 'ico':
            return 'image/x-icon';
        case 'jpg':
        case 'jpeg':
            return 'image/jpeg';
        default:
            return undefined;
    }
}

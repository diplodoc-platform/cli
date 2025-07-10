export function getFaviconType(faviconSrc: string): string | undefined {
    if (!faviconSrc) return undefined;

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

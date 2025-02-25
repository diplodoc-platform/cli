export function isExternalHref(href: string) {
    return /^(\w{1,10}:)?\/\//.test(href);
}

const MEDIA_FORMATS = /\.(svg|png|gif|jpe?g|bmp|webp|ico)$/;

export function isMediaLink(link: string) {
    return MEDIA_FORMATS.test(link);
}

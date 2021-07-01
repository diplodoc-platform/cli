export function isExternalHref(href: string) {
    return href.startsWith('http') || href.startsWith('//');
}

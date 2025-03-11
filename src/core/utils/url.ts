export function isExternalHref(href: string) {
    return /^(\w{1,10}:)?\/\//.test(href);
}

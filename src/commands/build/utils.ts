export function prettifyLink(href: string): string {
    href = href.replace(/\/index\.html([?#][^"]*)?$/i, (_, tail) => {
        return '/' + (tail ? tail : '');
    });

    href = href.replace(/\.html([?#][^"]*)?$/i, (_, tail) => {
        return '/' + (tail ? tail : '');
    });

    href = href.replace(/\/{2,}/g, '/');
    href = href.replace(/\/([?#])/g, '$1');

    if (href === '') return '/';

    return href;
}


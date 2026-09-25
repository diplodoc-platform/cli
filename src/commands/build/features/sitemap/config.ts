import {option} from '~/core/config';

const sitemap = option({
    flags: '--sitemap',
    desc: 'Generate sitemap.xml with absolute page urls.\n\nRequires baseHref to resolve page paths against.\n\nExample:\n {{PROGRAM}} build -i . -o ../build --sitemap --base-href https://example.com/docs',
});

export const options = {
    sitemap,
};

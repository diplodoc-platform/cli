import {option} from '~/core/config';

const skipHtmlExtension = option({
    flags: '--skip-html-extension',
    default: false,
    desc: `
        This option processes all links on the page, removing .html, index.html from them
    `,
});

export const options = {
    skipHtmlExtension,
};

import {option} from '~/core/config';

const skipHtmlExtension = option({
    flags: '--skip-html-extension',
    default: false,
    desc: `
        Skip .html extension
    `,
});

export const options = {
    skipHtmlExtension,
};

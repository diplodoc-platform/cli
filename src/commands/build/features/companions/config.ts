import {option} from '~/core/config';

const companions = option({
    flags: '--companions',
    desc: `
        Emit prepared Markdown or YAML companions next to static HTML pages.
        The artifacts use the same preprocessing pipeline as md2md output.
    `,
});

export const options = {
    companions,
};

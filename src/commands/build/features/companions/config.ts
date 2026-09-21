import {option} from '~/core/config';

const aiMdCompanions = option({
    flags: '--ai-md-companions',
    desc: `
        Emit prepared Markdown or YAML companions next to static HTML pages.
        The artifacts use the same preprocessing pipeline as md2md output. When the
        flag is passed it overrides the 'ai.mdCompanions' config value (default: false).
    `,
});

export const options = {
    aiMdCompanions,
};

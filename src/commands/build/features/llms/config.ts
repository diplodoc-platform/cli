import {option} from '~/core/config';

const llms = option({
    flags: '--llms',
    desc:
        'Generate llms.txt (index) and llms-full.txt (full markdown) per toc for LLM consumption. ' +
        'Works for both `md` and `html` output.',
});

export const options = {
    llms,
};

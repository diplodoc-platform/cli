import {option} from '~/core/config';

const hashIncludes = option({
    flags: '--hash-includes',
    hidden: true,
    desc: 'Toggle includes hashing.',
});

const mergeIncludes = option({
    flags: '--merge-includes',
    hidden: true,
    desc: 'Merge includes syntax during md to md processing.',
});

const mergeAutotitles = option({
    flags: '--merge-autotitles',
    hidden: true,
    desc: 'Merge autotitles syntax during md to md processing.',
});

export const options = {
    hashIncludes,
    mergeIncludes,
    mergeAutotitles,
};

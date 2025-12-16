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

const mergeSvg = option({
    flags: '--merge-svg',
    hidden: true,
    desc: 'Merge svg images during md to md processing.',
});

const keepNotVar = option({
    flags: '--keep-not-var',
    hidden: true,
    desc: 'Keep not_var for output md.',
});

const transparentMode = option({
    flags: '--transparent-mode',
    hidden: true,
    desc: 'Transparent mode',
});

const legacyConditions = option({
    flags: '--legacy-conditions',
    hidden: true,
    desc: 'Use legacy conditions',
});

export const options = {
    hashIncludes,
    mergeIncludes,
    mergeAutotitles,
    mergeSvg,
    keepNotVar,
    transparentMode,
    legacyConditions,
};

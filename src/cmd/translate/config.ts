import {option} from '~/config';
import {options as globalOptions} from '~/program';

const provider = option({
    flags: '--provider <value>',
    desc: 'Configure translation service provider.',
});

const sourceLanguage = option({
    flags: '-sl, --source-language <value>',
    desc: 'Source language code.',
});

const targetLanguage = option({
    flags: '-tl, --target-language <value>',
    desc: 'Target language code.',
});

export const options = {
    input: globalOptions.input,
    output: globalOptions.output,
    config: globalOptions.config,
    provider,
    sourceLanguage,
    targetLanguage,
};

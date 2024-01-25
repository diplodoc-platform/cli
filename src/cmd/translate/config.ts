import {green} from 'chalk';
import {option} from '~/config';
import {options as globalOptions} from '~/program';

export const NAME = 'translate';

export const DESCRIPTION = `
    Translate documentation from source to target language using configured translation provider.

    Select a provider to read more help:
      {{PROGRAM}} ${green('--provider yandex')} --help
`;

const provider = option({
    flags: '--provider <value>',
    desc: 'Configure translation service provider.',
});

const sourceLanguage = option({
    flags: '-sl, --source-language <value>',
    desc: `
        The text language to translate from.
        Specified in ISO 639-1 format (for example, ru).
    `,
});

const targetLanguage = option({
    flags: '-tl, --target-language <value>',
    desc: `
        The target language to translate the text.
        Specified in ISO 639-1 format (for example, en).
    `,
});

export const options = {
    input: globalOptions.input,
    output: globalOptions.output,
    config: globalOptions.config,
    provider,
    sourceLanguage,
    targetLanguage,
};

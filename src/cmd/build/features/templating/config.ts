import {option} from '../../../../config/utils';
import {bold, cyan, green} from 'chalk';

const disableLiquid = option({
    flags: '--disable-liquid',
    desc: 'Disable template engine.',
    default: false,
    deprecated: 'Use --no-template instead.',
});

const applyPresets = option({
    flags: '--apply-presets',
    desc: 'Should apply presets.',
    default: true,
    deprecated: 'Use --template-vars/--no-template-vars instead.',
});

const resolveConditions = option({
    flags: '--resolve-conditions',
    desc: 'Should resolve conditions.',
    default: true,
    deprecated: 'Use --template-conditions/--no-template-conditions instead.',
});

const conditionsInCode = option({
    flags: '--conditions-in-code',
    desc: 'Meet conditions in code blocks.',
    default: false,
    deprecated: 'Use --template=all or --template=code instead.',
});

const template = option({
    flags: '--template <value>',
    desc: `
        Select liquid template engine mode.
        By default liquid ignores code blocs. (${bold('text')} mode)
        Use ${bold('all')} or ${bold('code')}  mode to process code blocks.
        Use ${bold('--no-template')} to completely disable template engine.

        Read more about templating ${cyan('https://diplodoc.com/docs/en/syntax/vars')}
    `,
    choices: ['all', 'text', 'code'],
});

const noTemplate = option({
    flags: '--no-template',
    desc: 'Manual negation for --template',
    hidden: true,
    default: false,
});

const templateVars = option({
    flags: '--template-vars',
    desc: `
        Toggle processing of terms decorated by double curly braces in Toc and Md files. (Enabled by default)

        Read more about substitutions ${cyan('https://diplodoc.com/docs/en/syntax/vars#subtitudes')}

        Example:
          Some text ${green('{{some-variable}}')} end of text.
    `,
    default: true,
});

const templateConditions = option({
    flags: '--template-conditions',
    desc: `
        Toggle processing of conditions in Toc and Md files. (Enabled by default)

        Read more about conditions ${cyan('https://diplodoc.com/docs/en/syntax/vars#conditions')}

        Example:
          Some text ${green('{% if var == "any" %}')} extra ${green('{% endif %}')} end of text.
    `,
    default: true,
});

export const options = {
    template,
    noTemplate,
    templateVars,
    templateConditions,

    disableLiquid,
    applyPresets,
    resolveConditions,
    conditionsInCode,
};

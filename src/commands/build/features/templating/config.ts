import {bold, cyan, green} from 'chalk';

import {option} from '~/core/config';

const template = option({
    flags: '--template <value>',
    desc: `
        Select liquid template engine mode.
        By default liquid ignores code blocs. (${bold('text')} mode)
        Use ${bold('all')} or ${bold('code')} mode to process code blocks.
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
    defaultInfo: true,
});

const templateConditions = option({
    flags: '--template-conditions',
    desc: `
        Toggle processing of conditions in Toc and Md files. (Enabled by default)

        Read more about conditions ${cyan('https://diplodoc.com/docs/en/syntax/vars#conditions')}

        Example:
          Some text ${green('{% if var == "any" %}')} extra ${green('{% endif %}')} end of text.
    `,
    defaultInfo: true,
});

export const options = {
    template,
    noTemplate,
    templateVars,
    templateConditions,
};

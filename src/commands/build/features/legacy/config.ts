import {bold} from 'chalk';
import {option} from '~/core/config';

const disableLiquid = option({
    flags: '--disable-liquid',
    desc: 'Disable template engine.',
    defaultInfo: false,
    deprecated: 'Use --no-template instead.',
});

const applyPresets = option({
    flags: '--apply-presets',
    desc: 'Should apply presets.',
    defaultInfo: true,
    deprecated: 'Use --template-vars/--no-template-vars instead.',
});

const resolveConditions = option({
    flags: '--resolve-conditions',
    desc: 'Should resolve conditions.',
    defaultInfo: true,
    deprecated: 'Use --template-conditions/--no-template-conditions instead.',
});

const conditionsInCode = option({
    flags: '--conditions-in-code',
    desc: 'Meet conditions in code blocks.',
    defaultInfo: false,
    deprecated: 'Use --template=all or --template=code instead.',
});

const lintDisabled = option({
    flags: '--lint-disabled',
    desc: 'Disable linting.',
    hidden: true,
    deprecated: `Use ${bold('--no-lint')} instead.`,
});

const allowHTML = option({
    flags: '--allowHTML',
    desc: 'Allow to use HTML in Markdown files.',
    defaultInfo: true,
    deprecated: `Use ${bold('--allow-html')} for consistency.`,
});

const needToSanitizeHtml = option({
    flags: '--need-to-sanitize-html',
    desc: 'Toggle transformed HTML sanitizing. (Slow but secure feature)',
    defaultInfo: true,
    deprecated: `Use ${bold('--sanitize-html')} instead.`,
});

const useLegacyConditions = option({
    flags: '--use-legacy-conditions',
    desc: 'Temporal backward compatibility flag.',
    defaultInfo: false,
});

export const options = {
    disableLiquid,
    applyPresets,
    resolveConditions,
    conditionsInCode,
    lintDisabled,
    allowHTML,
    needToSanitizeHtml,
    useLegacyConditions,
};

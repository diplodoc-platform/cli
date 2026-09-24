import {extract} from '@diplodoc/translation';

/**
 * Whether the installed @diplodoc/translation has the adaptive code mode
 * (comments of any language and mermaid labels). Specs that need it are
 * skipped on older engines and come alive once the dependency is bumped.
 */
export const adaptiveCodeSupported = (() => {
    const {units} = extract('```yaml\n# Комментарий\nkey: value\n```\n', {
        compact: true,
        code: 'adaptive',
        source: {language: 'ru', locale: 'RU'},
        target: {language: 'en', locale: 'US'},
    } as Parameters<typeof extract>[1]);

    return units.length > 0;
})();

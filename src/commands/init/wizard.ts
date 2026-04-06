import type {TemplateType, WizardResult} from './types';

import {checkbox, confirm, input, select} from '@inquirer/prompts';
import {basename, resolve} from 'node:path';

import {console} from '~/core/utils';

const KNOWN_LANGS = [
    {name: 'Arabic        (ar)', value: 'ar'},
    {name: 'Bulgarian     (bg)', value: 'bg'},
    {name: 'Czech         (cs)', value: 'cs'},
    {name: 'Greek         (el)', value: 'el'},
    {name: 'English       (en)', value: 'en'},
    {name: 'Spanish       (es)', value: 'es'},
    {name: 'Estonian      (et)', value: 'et'},
    {name: 'French        (fr)', value: 'fr'},
    {name: 'Hebrew        (he)', value: 'he'},
    {name: 'Kazakh        (kk)', value: 'kk'},
    {name: 'Portuguese    (pt)', value: 'pt'},
    {name: 'Russian       (ru)', value: 'ru'},
    {name: 'Turkish       (tr)', value: 'tr'},
    {name: 'Uzbek         (uz)', value: 'uz'},
    {name: 'Chinese       (zh)', value: 'zh'},
    {name: 'Chinese (TW)  (zh-tw)', value: 'zh-tw'},
];

export async function runWizard(defaults: {
    output: string;
    template: TemplateType;
    header: boolean;
}): Promise<WizardResult> {
    console.log('');

    const outputRaw = await input({
        message: 'Where to create the project?',
        default: '.',
    });
    const output = resolve(process.cwd(), outputRaw);

    const name = await input({
        message: 'Project name:',
        default: basename(output),
    });

    const langs = await checkbox({
        message: 'Select languages:',
        choices: KNOWN_LANGS.map((l) => ({
            ...l,
            checked: l.value === 'en',
        })),
        validate: (chosen) => chosen.length > 0 || 'Select at least one language.',
    });

    let defaultLang = langs[0];

    if (langs.length > 1) {
        defaultLang = await select({
            message: 'Default language:',
            choices: langs.map((l) => ({name: l, value: l})),
            default: langs[0],
        });
    }

    const template = await select<TemplateType>({
        message: 'Template:',
        choices: [
            {name: 'minimal  (.yfm + toc.yaml + index.md)', value: 'minimal'},
            {name: 'full     (minimal + presets.yaml + pc.yaml + extended .yfm)', value: 'full'},
        ],
        default: defaults.template,
    });

    const header = await confirm({
        message: 'Add navigation header with controls?',
        default: defaults.header,
    });

    return {output, name, langs, defaultLang, template, header};
}

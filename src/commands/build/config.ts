import type {BuildArgs, BuildConfig} from './types';
import {ok} from 'node:assert';
import {bold, underline} from 'chalk';
import {options as globalOptions} from '~/commands/config';
import {defined, option, toggleable, valuable} from '~/core/config';
import {Lang, Stage} from '~/constants';

export enum OutputFormat {
    md = 'md',
    html = 'html',
}

const outputFormat = option({
    flags: '-f, --output-format <value>',
    defaultInfo: 'html',
    choices: ['html', 'md'],
    desc: `
        Format of output files. (html or md)

        If ${bold('html')} is selected, then renders md to static html files.
        (See also ${underline('--static-content')} option)

        If ${bold('md')} is selected, then renders md to prepared md files
        enriched by additional metadata.
        (Useful for complex documentation servers with runtime rendering)
    `,
});

const langs = option({
    flags: '--lang, --langs <value...>',
    desc: 'Configure langs supported by build',
});

const vars = option({
    flags: '-v, --vars <json>',
    desc: `
        Pass list of variables directly to build.
        Variables should be passed in JSON format.
        Passed variables overrides the same in presets.yaml

        Example:
          {{PROGRAM}} -i ./ -o ./build -v '{"name":"test"}'
    `,
    parser: (value) => JSON.parse(value),
});

const varsPreset = option({
    flags: '--vars-preset <value>',
    desc: `
        Select vars preset of documentation.
        Selected preset will be merged with default section of presets.yaml
    `,
});

const allowHtml = option({
    flags: '--allow-html',
    desc: 'Allow to use HTML in Markdown files.',
    defaultInfo: true,
});

const sanitizeHtml = option({
    flags: '--sanitize-html',
    desc: 'Toggle transformed HTML sanitizing. (Slow but secure feature)',
    defaultInfo: true,
});

const ignore = option({
    flags: '--ignore <glob...>',
    desc: `
        Do not process paths matched by glob.

        Example:
            {{PROGRAM}} -i ./input -o ./output --ignore *.bad.md

            or

            {{PROGRAM}} -i ./ -o ./build --ignore ./build
    `,
});

const vcs = option({
    flags: '--vcs',
    desc: `
        Enable or disable VCS connection.

        If disabled, then some features, like authors or auto redirects list,
        will be also disabled.
    `,
});

const vcsToken = option({
    flags: '--vcs-token <secret>',
    desc: `Secret token for enabled VCS connector.`,
    default: process.env.VCS_TOKEN,
});

// TODO: options below are not beautified.
const addMapFile = option({
    flags: '--add-map-file',
    desc: 'Should add all paths of documentation into file.json.',
});

const removeHiddenTocItems = option({
    flags: '--remove-hidden-toc-items',
    desc: 'Remove from Toc all items marked as hidden.',
});

const staticContent = option({
    flags: '--static-content',
    desc: 'Allow loading custom resources into statically generated pages.',
});

const ignoreStage = option({
    flags: '--ignore-stage <value...>',
    defaultInfo: [Stage.SKIP],
    desc: 'Ignore tocs with selected stages.',
});

const addSystemMeta = option({
    flags: '--add-system-meta',
    desc: 'Should add system section variables form presets into files meta data.',
});

export function normalize<C extends BuildConfig>(config: C, args: BuildArgs) {
    const ignoreStage = defined('ignoreStage', args, config) || [];
    const langs = defined('langs', args, config) || [];
    const lang = defined('lang', config);

    if (valuable(lang)) {
        if (!langs.length) {
            langs.push(lang);
        }

        ok(
            langs.includes(lang),
            `Configured default lang '${lang}' is not listed in langs (${langs.join(', ')})`,
        );
    }

    if (!langs.length) {
        langs.push(Lang.RU);
    }

    config.ignoreStage = [].concat(ignoreStage);
    config.langs = langs;
    config.lang = lang || langs[0];
    config.vcs = toggleable('vcs', args, config);
    config.vcs.token = defined('vcsToken', args);

    return config;
}

export function validate<C extends DeepFrozen<BuildConfig>>(config: C) {
    ok(!config.vcs?.token, 'Do not store secret VCS token in config. Use args or env.');
}

export const options = {
    input: globalOptions.input,
    output: globalOptions.output,
    config: globalOptions.config,
    langs,
    outputFormat,
    varsPreset,
    vars,
    allowHtml,
    sanitizeHtml,
    addMapFile,
    removeHiddenTocItems,
    staticContent,
    ignore,
    ignoreStage,
    addSystemMeta,
    vcs,
    vcsToken,
};

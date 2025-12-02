import type {BuildArgs, BuildConfig, ContentConfig} from './types';
import type {ExtendedOption} from '~/core/config';

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
    deprecated: `Use ${bold('--build-manifest')} instead.`,
    desc: 'Should add all paths of documentation into file.json.',
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

const interfaceToc = option({
    flags: '--interface-toc',
    desc: `
        Toc will be removed from html output.
    `,
    default: true,
    parser: () => false,
});

const interfaceSearch = option({
    flags: '--interface-search',
    desc: `
        Search will be removed from html output.
    `,
    default: true,
    parser: () => false,
});

const interfaceFeedback = option({
    flags: '--interface-feedback',
    desc: `
        Feedback (likes, dislikes) will be removed from html output.
    `,
    default: true,
    parser: () => false,
});

const pdfDebug = option({
    flags: '--pdf-debug',
    desc: `
        Adds to output files from pdf startPages section from toc.yaml

        Example:
            {{PROGRAM}} build -i . -o ../build --pdf-debug
    `,
    default: false,
});

const maxInlineSvgSize = option({
    flags: '--max-inline-svg-size <value>',
    desc: `
        Restriction on the maximum file size for inline SVG.
        Default: 2M
        Max size: 16M

        Example:
            {{PROGRAM}} build -i . -o ../build --max-inline-svg-size '128K'
    `,
    default: '2M',
    parser: fileSizeConverter({max: '16M'}),
});

const maxHtmlSize = option({
    flags: '--max-html-size <value>',
    desc: `
        Restriction on the maximum file size for rendered html file.
        Default: 42M
        Max size: 96M

        Example:
            {{PROGRAM}} build -i . -o ../build --max-html-size '128K'
    `,
    default: '42M',
    parser: fileSizeConverter({max: '96M'}),
});

export function combineProps<C extends BuildConfig>(
    config: C,
    group: string,
    props: Array<string>,
    args: Hash<ExtendedOption>,
) {
    const result = props.reduce<Record<string, unknown>>(
        (acc, prop: string) => {
            try {
                const configValue = defined(prop, config[group as keyof BuildConfig]);
                if (configValue !== null) {
                    acc[prop] = configValue;
                }
            } catch {}

            const argValue = defined(prop, config);
            if (argValue !== null && args[prop]?.defaultValue !== argValue) {
                acc[prop] = argValue;
            }

            if (args[prop] !== undefined && args[prop].parseArg) {
                acc[prop] = args[prop].parseArg(acc[prop] as string, args[prop].defaultValue);
            }
            return acc;
        },
        {} as Record<string, unknown>,
    );

    return result;
}

function getInterfaceProps<C extends BuildConfig>(config: C, args: BuildArgs) {
    const interfaceProps = ['toc', 'search', 'feedback'] as const;
    type InterfaceProp = (typeof interfaceProps)[number];

    const configInterface = config['interface'] || {};

    const result = interfaceProps.reduce<Record<InterfaceProp, boolean>>(
        (acc, prop) => {
            acc[prop] = true;

            const argProp =
                `interface${prop.charAt(0).toUpperCase() + prop.slice(1)}` as keyof BuildArgs;
            const argValue = defined(argProp, args);
            if (argValue !== null) {
                acc[prop] = argValue;
            }

            const configValue = defined(prop, configInterface);
            if (configValue !== null) {
                acc[prop] = configValue;
            }

            return acc;
        },
        {} as Record<InterfaceProp, boolean>,
    );

    return result;
}

export function fileSizeConverter(opts: Hash) {
    return function (input: string, defaultValue: string): number | undefined {
        const units = ['', 'K', 'M'];
        if (!input && typeof input !== 'number') {
            input = defaultValue;
        }
        if (typeof input === 'number') {
            return input;
        }
        function convert(input: string): number {
            const value = parseInt(input, 10);
            const unitType = input.replace(/\d+/g, '').trim().toUpperCase();
            const unitIndex = units.indexOf(unitType);
            if (unitIndex === -1) {
                throw new Error(
                    `Unknown unit type at config: ${unitType}. Allowed: K, M, k, m or without unit`,
                );
            }
            return value * 1024 ** unitIndex;
        }

        return Math.min(convert(input), convert(opts.max || '0'));
    };
}

export function normalize<C extends BuildConfig>(config: C, args: BuildArgs) {
    const ignoreStage = defined('ignoreStage', args, config) || [];
    const ignore = defined('ignore', args, config) || [];
    const langs = defined('langs', args, config) || [];
    const lang = defined('lang', config);
    const viewerInterface = getInterfaceProps(config, args);

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
    config.ignore = [].concat(ignore).map((rule: string) => {
        // Don't add /** to file patterns with extensions that don't end with *
        // We want: '**/*.md' to stay '**/*.md' (not become '**/*.md/**')
        // We want: 'file.txt' to stay 'file.txt' (not become 'file.txt/**')
        if (rule.includes('.') && !rule.endsWith('*')) {
            return rule;
        }
        // Add /** to directory patterns and wildcard patterns ending with *
        // Examples: 'build' → 'build/**', 'en/_api-ref/*' → 'en/_api-ref/*/**'
        return rule.replace(/\/*$/g, '/**');
    });
    config.langs = langs;
    config.lang = lang || langs[0];
    config.vcs = toggleable('vcs', args, config);
    config.vcs.token = defined('vcsToken', args);
    config.interface = {
        ...config.interface,
        ...viewerInterface,
    };
    config.content = combineProps(config, 'content', ['maxInlineSvgSize', 'maxHtmlSize'], {
        maxInlineSvgSize,
        maxHtmlSize,
    }) as ContentConfig;

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
    staticContent,
    ignore,
    ignoreStage,
    addSystemMeta,
    vcs,
    vcsToken,
    interfaceToc,
    interfaceSearch,
    interfaceFeedback,
    pdfDebug,
    maxInlineSvgSize,
    maxHtmlSize,
};

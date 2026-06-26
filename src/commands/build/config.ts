import type {AiConfig, BuildArgs, BuildConfig, ContentConfig} from './types';
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

/**
 * Default build config values.
 *
 * Extracted from the `@withConfigDefaults` decorator on the `Build` command so
 * that sibling commands (e.g. `content`) can reuse the exact same defaults
 * without duplicating them.
 */
export const buildConfigDefaults = (): Partial<BuildConfig> =>
    ({
        langs: [],
        outputFormat: OutputFormat.html,
        varsPreset: 'default',
        vars: {},
        ignore: [],
        allowHtml: true,
        sanitizeHtml: true,
        addMapFile: false,
        removeHiddenTocItems: false,
        removeEmptyTocItems: false,
        staticContent: false,
        ignoreStage: [Stage.SKIP],
        rawAddMeta: false,
        addSystemMeta: false,
        addResourcesMeta: true,
        addMetadataMeta: true,
        addAlternateMeta: true,
        lint: {enabled: true, config: {}},
        vcsPath: {enabled: true},
        idGenerator: 'random',
    }) as Partial<BuildConfig>;

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

const addAlternateMeta = option({
    flags: '--add-alternate-meta',
    desc: 'Should add alternate and canonical meta data.',
    defaultInfo: true,
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

const feedbackUrl = option({
    flags: '--feedback-url <url>',
    desc: `
        URL endpoint for feedback submission.

        Example:
            {{PROGRAM}} build -i . -o ../build --feedback-url https://api.example.com/feedback
    `,
});

const disableCsp = option({
    flags: '--disable-csp',
    desc: 'Disable Content-Security-Policy meta tag injection into generated HTML pages.',
    defaultInfo: false,
});

const pdfDebug = option({
    flags: '--pdf-debug',
    desc: `
        Adds to output files from pdf startPages and endPages sections from toc.yaml

        Example:
            {{PROGRAM}} build -i . -o ../build --pdf-debug
    `,
    default: false,
});

const maxOpenapiIncludeSize = option({
    flags: '--max-openapi-include-size <value>',
    desc: `
        Restriction on the maximum generated content size for OpenAPI includer pages.
        Pages exceeding this limit will be replaced with a stub.
        For disabled use '0' --max-openapi-include-size '0'
        Default: 0 (disabled)

        Example:
            {{PROGRAM}} build -i . -o ../build --max-openapi-include-size '8M'
    `,
    default: '0',
    parser: fileSizeConverter({disableIfZero: true}),
});

const maxOpenapiIncludeInlineSize = option({
    flags: '--max-openapi-include-inline-size <value>',
    desc: `
        Max size of the OpenAPI specification embedded inline on the leading page.
        If the spec exceeds this size, 'leadingPage.spec.renderMode: inline' is
        automatically switched to 'link' (a link to the *.openapi.json companion).
        Use '0' to always render the spec as a link.
        Default: 100K
        Max size: 1M

        Example:
            {{PROGRAM}} build -i . -o ../build --max-openapi-include-inline-size '256K'
    `,
    default: '100K',
    parser: fileSizeConverter({max: '1M'}),
});

const aiOpenapiCompanions = option({
    flags: '--ai-openapi-companions',
    desc: `
        Emit standalone OpenAPI spec companions (*.openapi.json) next to generated
        OpenAPI leading pages. When the flag is passed it is treated as a boolean override
        of the 'ai.openapiCompanions' config value. When omitted, the config value is used
        (default: 'md', i.e. emit only in md2md builds).

        Example:
            {{PROGRAM}} build -i . -o ../build --ai-openapi-companions
    `,
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

const maxAssetSize = option({
    flags: '--max-asset-size <value>',
    desc: `
        Restriction on the maximum asset size. For disabled use '0' --max-asset-size '0'
        Default: 64M

        Example:
            {{PROGRAM}} build -i . -o ../build --max-asset-size '128K'
    `,
    default: '64M',
    parser: fileSizeConverter({disableIfZero: true}),
});

const multilineTermDefinitions = option({
    flags: '--multiline-term-definitions',
    desc: `
        Support multiline term definitions.

        Example:
            {{PROGRAM}} build -i . -o ../build --multiline-term-definitions
    `,
    default: true,
});

const idGenerator = option({
    flags: '--id-generator <value>',
    choices: ['random', 'deterministic', 'constant'],
    defaultInfo: 'random',
    desc: `
        Strategy for generating element IDs (e.g. for tabs, terms, code blocks).

        If ${bold('random')} is selected, IDs are generated using Math.random() (legacy behavior).

        If ${bold('deterministic')} is selected, IDs are generated using per-file counters
        with a prefix (e.g. 'term-1', 'tab-2'). This produces stable, reproducible IDs
        across builds, which is useful for snapshot testing and diffing output.

        If ${bold('constant')} is selected, all generated IDs are the constant string '1'.
        This eliminates ID-related noise when diffing output of two build modes
        (e.g. with-merge-includes vs without-merge-includes).
    `,
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
                const groupConfig = config[group as keyof BuildConfig];
                if (groupConfig && typeof groupConfig === 'object') {
                    const configValue = defined(prop, groupConfig);
                    if (configValue !== null) {
                        acc[prop] = configValue;
                    }
                }
            } catch {}

            const argValue = defined(prop, config);
            if (argValue !== null && args[prop]?.defaultValue !== argValue) {
                acc[prop] = argValue;
            }

            if (args[prop] !== undefined && args[prop].parseArg !== undefined) {
                const parseArg = args[prop].parseArg;
                if (parseArg) {
                    acc[prop] = parseArg(acc[prop] as string, args[prop].defaultValue);
                }
            }
            return acc;
        },
        {} as Record<string, unknown>,
    );

    return result;
}

/**
 * Resolves the `ai` config group.
 *
 * `ai.openapiCompanions` is tri-state in config (`true | 'md' | false`), while the CLI flag is a
 * plain boolean override. The flag wins ONLY when it is explicitly passed; otherwise the `.yfm`
 * value is preserved as-is so it stays overridable from config (same approach as
 * `multilineTermDefinitions`, see run.ts). The default (`'md'`) is intentionally NOT applied
 * here — it is owned by the openapi extension (`DEFAULT_OPENAPI_COMPANIONS_MODE`), the single
 * place that consumes this value, keeping the default in one location.
 */
export function resolveAiConfig<C extends BuildConfig>(config: C, args: BuildArgs): AiConfig {
    const ai = (config.ai as Partial<AiConfig> | undefined) || {};

    const argValue = defined('aiOpenapiCompanions', args);
    const openapiCompanions =
        argValue === null || argValue === undefined ? ai.openapiCompanions : Boolean(argValue);

    return {...ai, openapiCompanions};
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
        if (opts.disableIfZero && input === '0') {
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

        if (opts.max === undefined) {
            return convert(input);
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
    const feedbackUrl = defined('feedbackUrl', args, config);

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
    config.content = combineProps(
        config,
        'content',
        [
            'maxInlineSvgSize',
            'maxHtmlSize',
            'maxAssetSize',
            'maxOpenapiIncludeSize',
            'maxOpenapiIncludeInlineSize',
            'multilineTermDefinitions',
        ],
        {
            maxInlineSvgSize,
            maxHtmlSize,
            maxAssetSize,
            maxOpenapiIncludeSize,
            maxOpenapiIncludeInlineSize,
            multilineTermDefinitions,
        },
    ) as ContentConfig;

    config.ai = resolveAiConfig(config, args);

    if (feedbackUrl) {
        config.feedback = config.feedback || {};
        config.feedback.url = feedbackUrl;
    }

    return config;
}

export function validate<C extends DeepFrozen<BuildConfig>>(config: C) {
    ok(!config.vcs?.token, 'Do not store secret VCS token in config. Use args or env.');
}

export const options = {
    input: globalOptions.input,
    output: globalOptions.output,
    config: globalOptions.config,
    strict: globalOptions.strict,
    originAsInput: globalOptions.originAsInput,
    copyOnWrite: globalOptions.copyOnWrite,
    workerMaxOldSpace: globalOptions.workerMaxOldSpace,
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
    feedbackUrl,
    pdfDebug,
    disableCsp,
    maxInlineSvgSize,
    maxHtmlSize,
    maxAssetSize,
    multilineTermDefinitions,
    addAlternateMeta,
    maxOpenapiIncludeSize,
    maxOpenapiIncludeInlineSize,
    aiOpenapiCompanions,
    idGenerator,
};

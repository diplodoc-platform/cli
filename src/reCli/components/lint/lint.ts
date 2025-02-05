import path from 'node:path';
import yaml from 'js-yaml';
import * as fs from 'node:fs';
import {isLocalUrl} from '@diplodoc/transform/lib/utils';
// @ts-ignore
import {LINK_KEYS} from '@diplodoc/client/ssr';
import pMap from 'p-map';
import liquid from '@diplodoc/transform/lib/liquid';
import yfmlint, {LintMarkdownFunctionOptions, PluginOptions} from '@diplodoc/transform/lib/yfmlint';
import {findAllValuesByKeys, getLinksWithExtension, logger} from '~/utils';
import {BuildConfig, Run} from '~/commands/build';
import {PresetIndex} from '~/reCli/components/presets/types';
import {LeadingPage} from '~/models';
import {fileExists, safePath} from '~/reCli/utils';
import {CONCURRENCY} from '~/reCli/constants';
import {getFilePresets} from '~/reCli/components/presets';
import {getPlugins} from '~/reCli/utils/plugins';
import log from '@diplodoc/transform/src/transform/log';
import {getLogLevel} from '@diplodoc/transform/lib/yfmlint/utils';
import {LogLevels} from '@diplodoc/transform/lib/log';
import {bold} from 'chalk';
import {LogCollector} from '~/reCli/utils/logger';
import {legacyConfig as legacyConfigFn} from '~/commands/build/legacy-config';

/*eslint-disable no-console*/

interface LintPageProps {
    cwd: string;
    draftCwd: string;
    presetIndex: PresetIndex;
    logger: LogCollector;
    options: BuildConfig;
    run: Run;
}

export async function lintPage(props: LintPageProps, pagePath: string) {
    const ext = path.extname(pagePath);

    switch (ext) {
        case '.yaml': {
            await lintYaml(props, pagePath);
            break;
        }
        case '.md': {
            await lintMd(props, pagePath);
            break;
        }
    }
}

async function lintYaml(props: LintPageProps, pagePath: string) {
    const {cwd, run} = props;
    const {lintConfig} = legacyConfigFn(run);
    const page = yaml.load(
        await fs.promises.readFile(path.join(cwd, pagePath) as AbsolutePath, 'utf8'),
    ) as LeadingPage;

    const logLevel = getLogLevel({
        logLevelsConfig: lintConfig['log-levels'],
        ruleNames: ['YAML001'],
        defaultLevel: log.LogLevels.ERROR,
    });

    const contentLinks = findAllValuesByKeys(page, LINK_KEYS);
    const localLinks = contentLinks.filter(
        (link) => getLinksWithExtension(link) && isLocalUrl(link),
    );

    await pMap(
        localLinks,
        async (link) => {
            const filePath = safePath(path.join(path.dirname(pagePath), link));
            const exists = await fileExists(path.join(cwd, filePath));
            if (!exists) {
                if (logLevel !== LogLevels.DISABLED) {
                    logger[logLevel]('', `Link is unreachable: ${bold(link)} in ${bold(pagePath)}`);
                }
            }
        },
        {concurrency: CONCURRENCY},
    );
}

async function lintMd(props: LintPageProps, pagePath: string) {
    const {cwd, presetIndex, logger, run} = props;

    const legacyConfig = legacyConfigFn(run);
    const {
        outputFormat,
        vars,
        useLegacyConditions,
        disableLiquid,
        applyPresets,
        resolveConditions,
        conditionsInCode,
    } = legacyConfig;

    const combinedVars = getFilePresets(presetIndex, vars, pagePath);

    const page = await fs.promises.readFile(path.join(cwd, pagePath) as AbsolutePath, 'utf8');

    let transformedPage = page;
    let sourceMap;
    if (!disableLiquid) {
        let liquidResult;
        if (outputFormat === 'md') {
            liquidResult = liquid(page, combinedVars, pagePath, {
                conditions: resolveConditions,
                substitutions: applyPresets,
                conditionsInCode,
                withSourceMap: true,
                keepNotVar: true,
                useLegacyConditions,
            });
        } else {
            liquidResult = liquid(page, combinedVars, pagePath, {
                conditionsInCode,
                withSourceMap: true,
                useLegacyConditions,
            });
        }

        transformedPage = liquidResult.output;
        sourceMap = liquidResult.sourceMap;
    }

    lintMarkdown(
        {
            ...props,
            logger,
        },
        {
            input: transformedPage,
            path: path.join(cwd, pagePath),
            sourceMap,
        },
    );
}

interface LintMarkdownProps extends LintPageProps {
    logger: LogCollector;
}

function lintMarkdown(props: LintMarkdownProps, params: LintMarkdownFunctionOptions) {
    const {presetIndex, cwd, draftCwd, run} = props;
    const legacyConfig = legacyConfigFn(run);
    const {lintConfig, vars, disableLiquid, outputFormat} = legacyConfig;

    const {input: page, path: absPagePath, sourceMap} = params;
    const pagePath = path.relative(cwd, absPagePath);

    let plugins: ReturnType<typeof getPlugins> = [];
    let pluginOptions: PluginOptions = {log: log};
    if (outputFormat === 'html') {
        plugins = getPlugins();
        const combinedVars = getFilePresets(presetIndex, vars, pagePath);

        pluginOptions = {
            output: draftCwd,
            vars: combinedVars,
            root: cwd,
            path: absPagePath,
            lintMarkdown: (paramsLocal: LintMarkdownFunctionOptions) => {
                return lintMarkdown(props, paramsLocal);
            },
            assetsPublicPath: path.relative(path.join(cwd, path.dirname(absPagePath)), cwd),
            disableLiquid,
            log: log,
            getVarsPerFile: (absPagePathLocal: string) => {
                const subFilepath = path.relative(cwd, absPagePathLocal);
                return getFilePresets(presetIndex, vars, subFilepath);
            },
        };
    }

    yfmlint({
        input: page,
        lintConfig,
        pluginOptions,
        plugins,
        defaultLintConfig: undefined,
        customLintRules: undefined,
        sourceMap,
    });
}

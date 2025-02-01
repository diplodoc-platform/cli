import type {Run} from '~/commands/build';

import {readFileSync, writeFileSync} from 'fs';
import {basename, dirname, extname, join} from 'node:path';
import shell from 'shelljs';
import {composeFrontMatter} from '@diplodoc/transform/lib/frontmatter';
import transform from '@diplodoc/transform';

import {ArgvService, PluginService} from '../services';
import {getVarsPerRelativeFile, mangleFrontMatter} from '~/utils';
import {PluginOptions} from '../models';
import {MD2MD_PARSER_PLUGINS, PROCESSING_FINISHED} from '../constants';
import {ChangelogItem} from '@diplodoc/transform/lib/plugins/changelog/types';
import {getPublicPath} from '@diplodoc/transform/lib/utilsFS';
import {ResolverResult} from '~/steps';

export async function resolveToMd(run: Run, path: RelativePath): Promise<ResolverResult> {
    const extension = extname(path);
    const vars = await run.vars.load(path);

    if (extension === '.yaml') {
        await run.leading.load(path);

        return {
            result: await run.leading.dump(path),
            info: {},
        };
    }

    const content = await mangleFrontMatter(run, path);
    const input = join(run.input, path);
    const output = join(run.output, path);

    const {result, changelogs} = transformMd2Md(run, content, {
        path: input,
        destPath: output,
        root: run.input,
        destRoot: run.output,
        vars: vars,
        log: run.logger,
        copyFile: copyFile(run),
        included: run.config.mergeIncludes,
    });

    if (run.config.changelogs && changelogs?.length) {
        const mdFilename = basename(output, extname(output));
        const outputDir = dirname(output);
        changelogs.forEach((changes, index) => {
            let changesName;
            const changesDate = changes.date as string | undefined;
            const changesIdx = changes.index as number | undefined;
            if (typeof changesIdx === 'number') {
                changesName = String(changesIdx);
            }
            if (!changesName && changesDate && /^\d{4}/.test(changesDate)) {
                changesName = Math.trunc(new Date(changesDate).getTime() / 1000);
            }
            if (!changesName) {
                changesName = `name-${mdFilename}-${String(changelogs.length - index).padStart(
                    3,
                    '0',
                )}`;
            }

            const changesPath = join(outputDir, `__changes-${changesName}.json`);

            writeFileSync(
                changesPath,
                JSON.stringify({
                    ...changes,
                    source: mdFilename,
                }),
            );
        });
    }

    run.logger.info(PROCESSING_FINISHED, path);

    return {
        result: composeFrontMatter(await run.meta.dump(path), result),
        info: {},
    };
}

function copyFile(run: Run) {
    return function (targetPath: string, targetDestPath: string, options?: PluginOptions) {
        shell.mkdir('-p', dirname(targetDestPath));

        if (options) {
            const sourceIncludeContent = readFileSync(targetPath, 'utf8');
            const {result} = transformMd2Md(run, sourceIncludeContent, options);
            writeFileSync(targetDestPath, result);
        } else {
            shell.cp(targetPath, targetDestPath);
        }
    };
}

function transformMd2Md(run: Run, input: string, options: PluginOptions) {
    const {root, vars, path} = options;
    const mdOptions = ArgvService.getConfig();
    const plugins = PluginService.getPlugins();

    const changelogs: ChangelogItem[] = [];

    let output = input;

    if (!disableLiquid) {
        const liquidResult = liquidMd2Md(input, vars, path);

        output = liquidResult.output;
    }

    const result = transform.collect(output, {
        mdItInitOptions: {
            ...mdOptions,
            isLiquided: true,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            plugins: plugins as MarkdownItPluginCb<any>[],
            vars,
            root,
            path,
            assetsPublicPath: './',
            getVarsPerFile: getVarsPerRelativeFile,
            getPublicPath,
            extractTitle: true,
        },
        pluginCollectOptions: {
            ...options,
            vars,
            path,
            changelogs,
            extractChangelogs: run.config.changelogs,
        },
        parserPluginsOverride: MD2MD_PARSER_PLUGINS,
    });

    return {
        result,
        changelogs,
    };
}

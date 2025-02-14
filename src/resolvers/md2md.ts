import type {Run} from '~/commands/build';
import type {ResolverResult} from '~/steps';
import type {PluginOptions} from '~/models';

import {readFileSync, writeFileSync} from 'fs';
import {basename, dirname, extname, join} from 'node:path';
import {dump} from 'js-yaml';
import shell from 'shelljs';
import liquid from '@diplodoc/transform/lib/liquid';
import {composeFrontMatter} from '@diplodoc/transform/lib/frontmatter';

import {mangleFrontMatter} from '~/utils';

import {ArgvService, PluginService} from '../services';
import {PROCESSING_FINISHED} from '../constants';
import {ChangelogItem} from '@diplodoc/transform/lib/plugins/changelog/types';

export async function resolveToMd(run: Run, path: RelativePath): Promise<ResolverResult> {
    const extension = extname(path);
    const vars = await run.vars.load(path);

    if (extension === '.yaml') {
        return {
            result: dump(await run.leading.dump(path)),
            info: {},
        };
    }

    const content = await mangleFrontMatter(run, path);
    const input = join(run.input, path);
    const output = join(run.output, path);

    const {result, changelogs} = transformMd2Md(content, {
        path: input,
        destPath: output,
        root: run.input,
        destRoot: run.output,
        vars: vars,
        log: run.logger,
        copyFile: copyFile,
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

function copyFile(targetPath: string, targetDestPath: string, options?: PluginOptions) {
    shell.mkdir('-p', dirname(targetDestPath));

    if (options) {
        const sourceIncludeContent = readFileSync(targetPath, 'utf8');
        const {result} = transformMd2Md(sourceIncludeContent, options);
        writeFileSync(targetDestPath, result);
    } else {
        shell.cp(targetPath, targetDestPath);
    }
}

function liquidMd2Md(input: string, vars: Hash, path: AbsolutePath) {
    const {applyPresets, resolveConditions, conditionsInCode, useLegacyConditions} =
        ArgvService.getConfig();

    return liquid(input, vars, path, {
        conditions: resolveConditions,
        substitutions: applyPresets,
        conditionsInCode,
        withSourceMap: true,
        keepNotVar: true,
        useLegacyConditions,
    });
}

function transformMd2Md(input: string, options: PluginOptions) {
    const {disableLiquid, changelogs: changelogsSetting} = ArgvService.getConfig();
    const {vars, path} = options;

    let output = input;
    const collectOfPlugins = PluginService.getCollectOfPlugins();
    const changelogs: ChangelogItem[] = [];

    if (!disableLiquid) {
        output = liquidMd2Md(output, vars, path).output;
    }

    if (collectOfPlugins) {
        output = collectOfPlugins(output, {
            ...options,
            changelogs,
            extractChangelogs: Boolean(changelogsSetting),
        });
    }

    return {
        result: output,
        changelogs,
    };
}

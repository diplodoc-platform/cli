import path from 'node:path';
import fs from 'node:fs';
import pMap from 'p-map';
import {CONCURRENCY} from '../../constants';
import liquid from '@diplodoc/transform/lib/liquid';
import {ChangelogItem} from '@diplodoc/transform/lib/plugins/changelog/types';
import {TransformPageProps} from '~/reCli/components/transform/transform';
import {cachedMkdir, cachedMkdirSync, getHash, safePath} from '~/reCli/utils';
import {getFilePresets} from '~/reCli/components/presets';
import {joinMetaAndContent, splitMetaAndContent} from '~/reCli/components/toc/utils';
import {Preset} from '~/commands/build';
import {getCollectOfPlugins} from '~/reCli/utils/plugins';
import {PluginOptions, YfmPreset} from '~/models';
import {getLog} from '~/reCli/utils/legacy';

/*eslint-disable no-console*/

export async function mdPageToMd(props: TransformPageProps, pagePath: string) {
    const {targetCwd, options} = props;
    const {changelogs} = options;
    const {output: page, changelogList} = await transformMd(props, pagePath);
    const targetPath = path.join(targetCwd, pagePath);
    await cachedMkdir(path.dirname(targetPath));
    await fs.promises.writeFile(targetPath, page);

    if (changelogs && changelogList.length) {
        const mdFilename = path.basename(pagePath, path.extname(pagePath));
        await pMap(
            changelogList,
            async (changes, index) => {
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
                    changesName = `name-${mdFilename}-${String(
                        changelogList.length - index,
                    ).padStart(3, '0')}`;
                }

                const changesPath = path.join(
                    targetCwd,
                    path.dirname(pagePath),
                    `__changes-${changesName}.json`,
                );

                await fs.promises.writeFile(
                    changesPath,
                    JSON.stringify({
                        ...changes,
                        source: mdFilename,
                    }),
                );
            },
            {concurrency: CONCURRENCY},
        );
    }
}

const TARGET_COPY_SET = new Set();

async function transformMd(props: TransformPageProps, pagePath: string) {
    const {presetIndex, cwd, options, fileMetaMap, vcsConnector} = props;
    const {vars, addSystemMeta, allowCustomResources, resources} = options;

    const combinedVars = getFilePresets(presetIndex, vars, pagePath);
    const input = await fs.promises.readFile(path.join(cwd, pagePath) as AbsolutePath, 'utf8');

    const includedPaths: string[] = [];

    const {output, changelogList} = transformMdLoop(
        input,
        {
            ...props,
            combinedVars,
            includedPaths,
        },
        pagePath,
    );

    let transformedPage = output;

    const {meta, content} = splitMetaAndContent(transformedPage);

    if (addSystemMeta) {
        fileMetaMap.set(pagePath, {...fileMetaMap.get(pagePath), __system: combinedVars.__system});
    }

    if (Array.isArray(combinedVars.__metadata)) {
        fileMetaMap.set(pagePath, {
            ...fileMetaMap.get(pagePath),
            metadata: [...(meta.metadata ?? []), ...combinedVars.__metadata],
        });
    }

    if (vcsConnector) {
        const author = vcsConnector.getAuthor(pagePath);
        const updatedAt = vcsConnector.getMtime(pagePath, includedPaths);
        const contributors = vcsConnector.getContributors(pagePath, includedPaths);
        fileMetaMap.set(pagePath, {
            ...fileMetaMap.get(pagePath),
            ...(author ? {author} : {}),
            ...(contributors.length ? {contributors} : {}),
            ...(updatedAt ? {updatedAt} : {}),
        });

        if (meta.author) {
            let forceAuthor: string | object | null = meta.author as string | object;
            if (typeof forceAuthor === 'string') {
                forceAuthor = await vcsConnector.getAuthorByUsername(meta.author as string);
            }
            fileMetaMap.set(pagePath, {
                ...fileMetaMap.get(pagePath),
                author: forceAuthor ?? undefined,
            });
        }
    }

    if (allowCustomResources && resources) {
        fileMetaMap.set(pagePath, {
            ...fileMetaMap.get(pagePath),
            ...resources,
        });
    }

    const extraMeta = fileMetaMap.get(pagePath);
    if (extraMeta) {
        Object.assign(meta, extraMeta);
    }

    transformedPage = joinMetaAndContent(meta, content);

    return {output: transformedPage, changelogList};
}

interface TransformMdLoopOptions extends TransformPageProps {
    combinedVars: Preset;
    includedPaths: string[];
}

function transformMdLoop(input: string, props: TransformMdLoopOptions, pagePath: string) {
    const {cwd, targetCwd, combinedVars, writeConflicts, includedPaths, logger, run} = props;
    const {
        resolveConditions,
        applyPresets,
        useLegacyConditions,
        conditionsInCode,
        disableLiquid,
        changelogs,
        hashIncludes,
    } = run.legacyConfig;

    let output;
    if (disableLiquid) {
        output = input;
    } else {
        const liquidResult = liquid(input, combinedVars, pagePath, {
            conditions: resolveConditions,
            substitutions: applyPresets,
            conditionsInCode,
            withSourceMap: true,
            keepNotVar: true,
            useLegacyConditions,
        });

        output = liquidResult.output;
    }

    const changelogList: ChangelogItem[] = [];

    const collectOfPlugins = getCollectOfPlugins();

    if (collectOfPlugins) {
        output = collectOfPlugins(output, {
            applyPresets,
            resolveConditions,
            useLegacyConditions,
            conditionsInCode,
            destPath: path.join(targetCwd, safePath(pagePath)),
            root: cwd,
            destRoot: targetCwd,
            collectOfPlugins,
            log: getLog(),
            copyFile: (targetPath: string, targetDestPath: string, subOptions?: unknown) => {
                const relSource = safePath(path.relative(cwd, targetPath));
                const relTarget = safePath(path.relative(targetCwd, targetDestPath));

                includedPaths.push(relSource);

                if (subOptions) {
                    logger.info(`Include ${relSource}`);

                    const inputLocal = fs.readFileSync(path.join(cwd, relSource), 'utf-8');
                    const {content: inputLocalNoMeta} = splitMetaAndContent(inputLocal);
                    const {output: outputLocal} = transformMdLoop(
                        inputLocalNoMeta,
                        props,
                        relSource,
                    );

                    const extName = path.extname(relTarget);
                    const fileName = path.basename(relTarget, extName);
                    const newRelTarget = hashIncludes
                        ? path.join(
                              path.dirname(relTarget),
                              `_include--${fileName}--${getHash(outputLocal, 7)}${extName}`,
                          )
                        : relTarget;

                    const targetFilename = path.join(targetCwd, newRelTarget);

                    if (TARGET_COPY_SET.has(newRelTarget)) {
                        // console.log('skip sub page', newRelTarget);
                        if (!hashIncludes) {
                            writeConflicts.set(newRelTarget, outputLocal);
                        }
                        return {
                            target: targetFilename,
                        };
                    }
                    TARGET_COPY_SET.add(newRelTarget);

                    cachedMkdirSync(path.dirname(targetFilename));

                    fs.writeFileSync(targetFilename, outputLocal);

                    return {
                        target: targetFilename,
                    };
                } else {
                    logger.info(`Copy resource ${relSource}`);

                    if (TARGET_COPY_SET.has(relTarget)) {
                        // console.log('skip copy', relSource);
                        return undefined;
                    }
                    TARGET_COPY_SET.add(relTarget);

                    const targetFilename = path.join(targetCwd, relTarget);
                    cachedMkdirSync(path.dirname(targetFilename));

                    fs.cpSync(path.join(cwd, relSource), targetFilename);
                }
                return undefined;
            },
            vars: combinedVars as YfmPreset,
            path: path.join(cwd, safePath(pagePath)),
            changelogs: changelogList,
            extractChangelogs: Boolean(changelogs),
        } as unknown as PluginOptions);
    }

    return {output, changelogList, includedPaths};
}

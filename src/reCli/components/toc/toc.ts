import fs from 'node:fs';
import path from 'node:path';
import {BuildConfig, Run} from '~/commands/build';
import {PresetIndex} from '~/reCli/components/presets/types';
import {TocIndexMap} from '~/reCli/components/toc/types';
import pMap from 'p-map';
import yaml from 'js-yaml';
import {YfmToc} from '~/models';
import {CONCURRENCY} from '~/reCli/constants';
import {getFilePresets} from '~/reCli/components/presets';
import {filterFiles, firstFilterItem, firstFilterTextItems} from '~/services/utils';
import {liquidField} from '~/reCli/components/toc/utils';
import {liquidSnippet} from '@diplodoc/transform/lib/liquid';
import {IncludersError, applyIncluders} from '~/services/includers';
import {logger} from '~/utils';
import {IncludeMode, Stage} from '~/constants';
import shell from 'shelljs';
import {safePath} from '~/reCli/utils';

interface GetTocIndexProps {
    options: BuildConfig;
    presetIndex: PresetIndex;
    run: Run;
    logger: typeof logger;
}

export async function getTocIndex(cwd: AbsolutePath, props: GetTocIndexProps) {
    const {run, options} = props;
    const {ignore} = options;
    const index: TocIndexMap = new Map();

    const tocs = await run.glob('**/toc.yaml', {cwd, ignore});

    const includedTocs: string[] = [];

    await pMap(
        tocs,
        async (tocPath) => {
            const data = await fs.promises.readFile(path.join(cwd, tocPath), 'utf8');
            const toc = yaml.load(data) as YfmToc;
            const parsedToc = await transformToc(toc, {...props, cwd, tocPath});
            if (parsedToc) {
                index.set(tocPath, {toc: parsedToc.toc, copyMap: parsedToc.copyMap});
                includedTocs.push(...parsedToc.includedTocs);
            }
        },
        {concurrency: CONCURRENCY},
    );

    includedTocs.forEach((tocPath) => {
        index.delete(tocPath);
    });

    return index;
}

interface TransformTocProps extends GetTocIndexProps {
    cwd: string;
    tocPath: string;
}

async function transformToc(tocOrig: YfmToc, props: TransformTocProps) {
    const {
        presetIndex,
        tocPath,
        options,
        run: {legacyConfig},
    } = props;
    const {vars, ignoreStage} = options;
    const combinedVars = getFilePresets(presetIndex, vars, tocPath) as Record<string, string>;

    const toc = tocOrig;

    if (toc.stage && ignoreStage.includes(toc.stage)) {
        return null;
    }

    if (toc.title) {
        toc.title = firstFilterTextItems(toc.title, combinedVars, {
            resolveConditions: true,
        });
    }

    if (typeof toc.title === 'string') {
        toc.title = liquidField(toc.title, combinedVars, tocPath, legacyConfig);
    }

    if (typeof toc.navigation === 'string') {
        toc.navigation = liquidField(toc.navigation, combinedVars, tocPath, legacyConfig);
    }

    if (toc.label) {
        toc.label = firstFilterItem(toc.label, combinedVars, {
            resolveConditions: true,
        });
    }

    const copyMap = new Map<string, string>();
    const {includedTocs, items} = await processTocItems(toc.items, combinedVars, {
        ...props,
        copyMap,
    });
    toc.items = items;

    return {toc, includedTocs, copyMap};
}

interface ProcessTocItemsProps extends TransformTocProps {
    copyMap: Map<string, string>;
}

async function processTocItems(
    items: YfmToc[],
    vars: Record<string, string>,
    props: ProcessTocItemsProps,
) {
    const {tocPath, logger, run} = props;
    const {resolveConditions, removeHiddenTocItems} = run.legacyConfig;

    let preparedItems = items;

    /* Should remove all links with false expressions */
    if (resolveConditions || removeHiddenTocItems) {
        try {
            preparedItems = filterFiles(items, 'items', vars, {
                resolveConditions,
                removeHiddenTocItems,
            });
        } catch (err) {
            const error = err as Error;
            logger.error(
                tocPath,
                `Error while filtering toc file: ${tocPath}. Error message: ${error.stack}`,
            );
        }
    }

    /* Should resolve all includes */
    return replaceIncludes(preparedItems, vars, props);
}

interface ReplaceIncludesProps extends TransformTocProps {
    copyMap: Map<string, string>;
}

async function replaceIncludes(
    items: YfmToc[],
    vars: Record<string, string>,
    props: ReplaceIncludesProps,
) {
    const {copyMap, cwd, tocPath, logger} = props;
    const result: YfmToc[] = [];
    const includedTocs: string[] = [];

    for (const item of items) {
        let includedInlineItems: YfmToc[] | null = null;

        if (item.name) {
            item.name = _liquidSubstitutions(item.name, vars, props);
        }

        try {
            await applyIncluders(props.tocPath, item, vars);
        } catch (err) {
            if (err instanceof Error || err instanceof IncludersError) {
                const message = err.toString();

                const file = err instanceof IncludersError ? err.path : props.tocPath;

                logger.error(file, message);
            }
        }

        if (item.include) {
            const {mode = IncludeMode.ROOT_MERGE} = item.include;
            const includeTocPath =
                mode === IncludeMode.ROOT_MERGE
                    ? item.include.path
                    : path.join(path.dirname(tocPath), item.include.path);
            const includeTocDir = path.dirname(includeTocPath);

            try {
                const includeToc = yaml.load(
                    await fs.promises.readFile(
                        path.join(cwd, safePath(includeTocPath)) as AbsolutePath,
                        'utf8',
                    ),
                ) as YfmToc;

                // TODO: use options
                // Should ignore included toc with tech-preview stage.
                if (includeToc.stage === Stage.TECH_PREVIEW) {
                    continue;
                }

                includedTocs.push(includeTocPath);

                if (mode === IncludeMode.MERGE || mode === IncludeMode.ROOT_MERGE) {
                    await copyTocDir(props.run, cwd, includeTocDir, path.dirname(tocPath), copyMap);
                }

                const itemsWithIncluded = (item.items || []).concat(includeToc.items);

                /* Resolve nested toc inclusions */
                const baseTocPath =
                    mode === IncludeMode.LINK ? includeTocPath : path.dirname(tocPath);

                const {items: subItems, includedTocs: subIncludedTocs} = await processTocItems(
                    itemsWithIncluded,
                    vars,
                    {
                        ...props,
                        tocPath: baseTocPath,
                    },
                );

                includedTocs.push(...subIncludedTocs);

                let includedTocItems = subItems;

                /* Make hrefs relative to the main toc */
                if (mode === IncludeMode.LINK) {
                    includedTocItems = _replaceIncludesHrefs(
                        includedTocItems,
                        includeTocDir,
                        path.dirname(tocPath),
                    );
                }

                if (item.name) {
                    item.items = includedTocItems;
                } else {
                    includedInlineItems = includedTocItems;
                }
            } catch (err) {
                const error = err as Error;
                logger.error(
                    tocPath,
                    `Error while including toc: ${includeTocPath} to ${tocPath}. Error: ${error.stack}`,
                );

                continue;
            } finally {
                delete item.include;
            }
        } else if (item.items) {
            const {items: subItems, includedTocs: subIncludedTocs} = await processTocItems(
                item.items,
                vars,
                props,
            );
            item.items = subItems;
            includedTocs.push(...subIncludedTocs);
        }

        if (includedInlineItems) {
            result.push(...includedInlineItems);
        } else {
            result.push(item);
        }
    }

    return {items: result, includedTocs};
}

function _liquidSubstitutions(
    name: string,
    vars: Record<string, string>,
    props: TransformTocProps,
) {
    const {
        tocPath,
        run: {legacyConfig},
    } = props;
    const {outputFormat, applyPresets} = legacyConfig;
    if (outputFormat === 'md' && !applyPresets) {
        return name;
    }

    return liquidSnippet(name, vars, tocPath, {
        conditions: false,
        substitutions: true,
    });
}

function _replaceIncludesHrefs(items: YfmToc[], includeTocDir: string, tocDir: string): YfmToc[] {
    return items.reduce((acc, tocItemOrig) => {
        const tocItem = tocItemOrig;
        if (tocItem.href) {
            tocItem.href = path.relative(tocDir, path.join(includeTocDir, tocItem.href));
        }

        if (tocItem.items) {
            tocItem.items = _replaceIncludesHrefs(tocItem.items, includeTocDir, tocDir);
        }

        if (tocItem.include) {
            const {path: filePath} = tocItem.include;
            tocItem.include.path = path.relative(tocDir, path.join(includeTocDir, filePath));
        }

        return acc.concat(tocItem);
    }, [] as YfmToc[]);
}

async function copyTocDir(
    run: Run,
    cwd: string,
    tocPath: string,
    destDir: string,
    copyMap: Map<string, string>,
) {
    const source = path.join(cwd, safePath(tocPath));
    const target = path.join(cwd, safePath(destDir));

    const files = await run.glob('**/*.*', {
        ignore: ['**/toc.yaml'],
    });

    const dirs = new Set<string>();
    files.forEach((relPath) => {
        const from = path.join(source, relPath);
        const to = path.join(target, relPath);
        const toDir = path.dirname(to);

        if (!dirs.has(toDir)) {
            dirs.add(toDir);
            shell.mkdir('-p', toDir);
        }

        shell.cp(from, to);

        const relSourceFile = path.relative(cwd, from);
        const relTargetFile = path.relative(cwd, to);
        copyMap.set(relSourceFile, relTargetFile);
    });
}

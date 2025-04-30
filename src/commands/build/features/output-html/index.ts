import type {ConfigData, PreloadParams} from '@diplodoc/client/ssr';
import type {Build} from '~/commands/build';
import type {Toc, TocItem} from '~/core/toc';
import type {LeadingPage} from '~/core/leading';

import {basename, dirname, extname, join} from 'node:path';
import {v4 as uuid} from 'uuid';
import pmap from 'p-map';
import {preprocess} from '@diplodoc/client/ssr';
import {isFileExists} from '@diplodoc/transform/lib/utilsFS';

import {fallbackLang, isExternalHref, normalizePath, own, zip} from '~/core/utils';
import {getHooks as getBuildHooks} from '~/commands/build';
import {getHooks as getTocHooks} from '~/core/toc';
import {getHooks as getLeadingHooks} from '~/core/leading';
import {getHooks as getMarkdownHooks} from '~/core/markdown';
import {getHooks as getRedirectsHooks} from '../../services/redirects';
import {ASSETS_FOLDER} from '~/constants';

import {getBaseMdItPlugins, getCustomMdItPlugins} from './utils';

export class OutputHtml {
    apply(program: Build) {
        getBuildHooks(program)
            .BeforeRun.for('html')
            .tap('Html', async (run) => {
                getTocHooks(run.toc).Dump.tapPromise('Html', async (toc, path) => {
                    await run.toc.walkItems([toc], (item: Toc | TocItem) => {
                        if (own(item, 'hidden') && item.hidden) {
                            return undefined;
                        }

                        item.id = uuid();

                        if (own<string, 'href'>(item, 'href') && !isExternalHref(item.href)) {
                            const fileExtension: string = extname(item.href);
                            const filename: string = basename(item.href, fileExtension) + '.html';

                            item.href = normalizePath(
                                join(dirname(path), dirname(item.href), filename),
                            );
                        }

                        return item;
                    });

                    return toc;
                });

                // Dump Toc to js file
                getTocHooks(run.toc).Resolved.tapPromise('Html', async (_toc, path) => {
                    const file = join(run.output, dirname(path), 'toc.js');
                    const result = await run.toc.dump(path);

                    await run.write(file, `window.__DATA__.data.toc = ${JSON.stringify(result)};`);
                });

                // Transform Page Constructor yfm blocks
                getLeadingHooks(run.leading).Plugins.tap('Html', (plugins) => {
                    return plugins.concat(async function (leading) {
                        if (!leading.blocks) {
                            return leading;
                        }

                        const {path, lang, vars} = this;
                        const options = {lang: fallbackLang(lang)} as PreloadParams;

                        const strings = new Set<string>();
                        const extract = (_lang: string, string: string) => {
                            strings.add(string);
                            return string;
                        };

                        preprocess(leading as ConfigData, options, extract);

                        const keys = [...strings];
                        if (!keys.length) {
                            return leading;
                        }

                        const values = zip(
                            keys,
                            await pmap(keys, async (string) => {
                                const {content, deps, assets} = await run.markdown.analyze(
                                    path,
                                    string,
                                    vars,
                                );

                                return run.transform(path, content, {
                                    deps: deps.map(({path}) => path),
                                    assets,
                                });
                            }),
                        );
                        const compose = (_lang: string, string: string) =>
                            values[string][0] as string;

                        return preprocess(leading as ConfigData, options, compose) as LeadingPage;
                    });
                });

                getMarkdownHooks(run.markdown).Plugins.tap('Html', (plugins) => {
                    return plugins.concat(getBaseMdItPlugins()).concat(getCustomMdItPlugins());
                });

                getLeadingHooks(run.leading).Dump.tapPromise('Html', async (leading, path) => {
                    return run.leading.walkLinks(leading, getHref(run.input, path));
                });

                getMarkdownHooks(run.markdown).Dump.tapPromise(
                    'Html',
                    async (markdown, path, info) => {
                        const deps = await run.markdown.deps(path);
                        const assets = await run.markdown.assets(path);
                        const [result, env] = await run.transform(path, markdown, {
                            deps: deps.map(({path}) => path),
                            assets,
                        });

                        run.meta.addResources(path, env.meta);

                        Object.assign(info, env);

                        return result;
                    },
                );

                getRedirectsHooks(run.redirects).Release.tap('Html', () => {
                    // Do not save redirects.yaml for html mode
                    return null;
                });
            });

        getBuildHooks(program)
            .AfterRun.for('html')
            .tapPromise('Html', async (run) => {
                await run.copy(run.input, run.output, ['**/*.yaml', '**/*.md']);
                await run.copy(ASSETS_FOLDER, run.bundlePath, ['search-extension/**']);
            });

        // Generate redirects
        getBuildHooks(program)
            .AfterRun.for('html')
            .tapPromise('Html', async (run) => {
                const langRelativePath = `./${run.config.lang}/index.html`;
                const langPath = join(run.output, langRelativePath);
                const pagePath = join(run.output, 'index.html');

                // Generate root lang redirect if it doesn't exists
                if (!run.exists(pagePath) && run.exists(langPath)) {
                    const content = await run.redirects.page(run.config.lang, langRelativePath);
                    await run.write(pagePath, content);
                }

                // Generate redirect for each record in redirects.files section
                for (const {from, to} of run.redirects.files) {
                    const content = await run.redirects.page(run.config.lang, to);
                    await run.write(join(run.output, from), content);
                }
            });
    }
}

function getHref(root: AbsolutePath, path: NormalizedPath) {
    return function (href: string) {
        if (isExternalHref(href)) {
            return href;
        }

        if (!href.startsWith('/')) {
            href = join(dirname(path), href);
        }

        const filePath = join(root, href);

        if (isFileExists(filePath)) {
            href = href.replace(/\.(md|ya?ml)$/gi, '.html');
        } else if (!/.+\.\w+$/gi.test(href)) {
            // TODO: isFileExists index.md or index.yaml
            href = href + (href.endsWith('/') ? '' : '/') + 'index.html';
        }

        return href;
    };
}

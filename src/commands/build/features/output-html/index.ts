import type {ConfigData, PreloadParams} from '@diplodoc/client/ssr';
import type {Build, EntryData} from '~/commands/build';
import type {Toc, TocItem} from '~/core/toc';
import type {LeadingPage} from '~/core/leading';
import type {PageData} from '../../services/entry';

import {basename, dirname, extname, join} from 'node:path';
import {v4 as uuid} from 'uuid';
import pmap from 'p-map';
import {preprocess} from '@diplodoc/client/ssr';
import {isFileExists} from '@diplodoc/transform/lib/utilsFS';

import {Template} from '~/core/template';
import {fallbackLang, isExternalHref, normalizePath, own, setExt, zip} from '~/core/utils';
import {getHooks as getBuildHooks} from '~/commands/build';
import {getHooks as getTocHooks} from '~/core/toc';
import {getHooks as getLeadingHooks} from '~/core/leading';
import {getHooks as getMarkdownHooks} from '~/core/markdown';
import {getHooks as getEntryHooks} from '../../services/entry';
import {getHooks as getRedirectsHooks} from '../../services/redirects';
import {ASSETS_FOLDER} from '~/constants';

import {getBaseMdItPlugins, getCustomMdItPlugins} from './utils';

const tocJS = (path: NormalizedPath) => setExt(path, '.js');

const __Entry__ = Symbol('isEntry');

export class OutputHtml {
    apply(program: Build) {
        getBuildHooks(program)
            .BeforeRun.for('html')
            .tap('Html', async (run) => {
                getTocHooks(run.toc).Dump.tapPromise('Html', async (vfile) => {
                    await run.toc.walkItems([vfile.data as Toc], (item: Toc | TocItem) => {
                        if (own(item, 'hidden') && item.hidden) {
                            return undefined;
                        }

                        item.id = uuid();

                        if (own<string, 'href'>(item, 'href') && !isExternalHref(item.href)) {
                            const fileExtension: string = extname(item.href);
                            const filename: string = basename(item.href, fileExtension) + '.html';

                            item.href = normalizePath(
                                join(dirname(vfile.path), dirname(item.href), filename),
                            );
                        }

                        return item;
                    });
                });

                // Dump Toc to js file
                getTocHooks(run.toc).Dump.tapPromise(
                    {name: 'Html', stage: Infinity},
                    async (vfile) => {
                        vfile.format(
                            (data) => `window.__DATA__.data.toc = ${JSON.stringify(data)};`,
                        );
                        vfile.path = setExt(vfile.path, 'js');
                    },
                );

                // Add link to dumped toc.js to html template
                getEntryHooks(run.entry).Page.tap('Html', (template) => {
                    if (!template.is(__Entry__)) {
                        return;
                    }

                    const toc = run.toc.for(template.path);

                    template.addScript(tocJS(toc.path), {position: 'state'});
                });

                // Transform any entry to final html page
                getEntryHooks(run.entry).Dump.tapPromise('Html', async (vfile) => {
                    const toc = await run.toc.dump(vfile.path);

                    const data = getStateData(vfile.data);
                    const state = await run.entry.state(vfile.path, data);
                    const template = new Template(vfile.path, state.lang, [__Entry__]);

                    const html = await run.entry.page(template, state, toc.data);
                    vfile.path = setExt(vfile.path, '.html');
                    vfile.info = data;
                    vfile.format(() => html);
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
                                const {content, deps, assets} = await run.markdown.inspect(
                                    path,
                                    string,
                                    vars,
                                );

                                return run.transform(path, content, {
                                    deps: deps,
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

                getLeadingHooks(run.leading).Dump.tapPromise('Html', async (vfile) => {
                    vfile.data = await run.leading.walkLinks(
                        vfile.data,
                        getHref(run.input, vfile.path),
                    );
                });

                // Transform markdown to html
                getMarkdownHooks(run.markdown).Dump.tapPromise('Html', async (vfile) => {
                    const deps = await run.markdown.deps(vfile.path);
                    const assets = await run.markdown.assets(vfile.path);
                    const [result, env] = await run.transform(vfile.path, vfile.data, {
                        deps,
                        assets,
                    });

                    run.meta.addResources(vfile.path, env.meta);

                    vfile.data = result;
                    vfile.info = {...vfile.info, ...env};
                });

                getRedirectsHooks(run.redirects).Release.tap('Html', () => {
                    // Do not save redirects.yaml for html mode
                    return null;
                });
            });

        // Copy project assets to output
        getBuildHooks(program)
            .AfterRun.for('html')
            .tapPromise('Html', async (run) => {
                // TODO: we copy all files. Required to copy only used files.
                // Look at the same copy process in output-md feature.
                await run.copy(run.input, run.output, ['**/*.yaml', '**/*.md']);
                await run.copy(ASSETS_FOLDER, run.bundlePath, ['search-extension/**']);
            });

        // Generate redirects
        getBuildHooks(program)
            .AfterRun.for('html')
            .tapPromise('Html', async (run) => {
                const langRelativePath: RelativePath = `./${run.config.lang}/index.html`;
                const langPath = join(run.output, langRelativePath);
                const pagePath = join(run.output, 'index.html');

                // Generate root lang redirect if it doesn't exists
                if (!run.exists(pagePath) && run.exists(langPath)) {
                    const content = await run.redirects.page('./', langRelativePath);
                    await run.write(pagePath, content);
                }

                // Generate redirect for each record in redirects.files section
                for (const {from, to} of run.redirects.files) {
                    const content = await run.redirects.page(from, to);
                    await run.write(join(run.output, from), content);
                }
            });
    }
}

function getStateData(entry: EntryData): PageData {
    if (entry.type === 'yaml') {
        return {
            leading: true,
            data: entry.content.data,
            meta: entry.meta,
            title: entry.content.data.title || entry.meta.title || '',
        };
    } else {
        return {
            leading: false,
            html: entry.content.toString(),
            meta: entry.meta,
            headings: entry.info.headings,
            title: entry.info.title || entry.meta.title || '',
        };
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

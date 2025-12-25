import type {Build} from '~/commands/build';
import type {EntryTocItem, Toc} from '~/core/toc';
import type {PdfPageResult} from './utils';
import type {Command} from '~/core/config';
import type {PageContent} from '@diplodoc/page-constructor-extension';

import {dirname, join} from 'node:path';
import {createServerPageConstructorContent} from '@diplodoc/page-constructor-extension/renderer';

import {getHooks as getBuildHooks, getEntryHooks} from '~/commands/build';
import {getHooks as getBaseHooks} from '~/core/program';
import {getHooks as getTocHooks} from '~/core/toc';
import {getHooks as getLeadingHook} from '~/core/leading';
import {normalizePath} from '~/core/utils';
import {Template} from '~/core/template';
import {BUNDLE_FOLDER} from '~/constants';

import {
    PDF_PAGE_FILENAME,
    findCssDependencies,
    getPdfUrl,
    isEntryHidden,
    joinPdfPageResults,
    replacePCNestedLinks,
} from './utils';
import {options} from './config';

export type PdfPageArgs = {
    pdf: boolean;
};

const PDF_DIRNAME = 'pdf';
const PDF_PAGE_DATA_FILENAME = 'pdf-page.json';
const PDF_TOC_FILENAME = 'pdf-page-toc.js';

const __PdfPage__ = Symbol('isPdfPage');

export class PdfPage {
    apply(program: Build) {
        const results: Record<NormalizedPath, PdfPageResult> = {};
        const pdfLinks: NormalizedPath[] = [];

        getBaseHooks(program).Command.tap('Pdf', (command: Command) => {
            command.addOption(options.pdf);
        });

        getBaseHooks(program).Config.tap('Pdf', (config, args) => {
            const pdfArg = args.pdf || false;
            const pdfEnabled = config?.pdf?.enabled || false;
            const hiddenPolicy = config?.pdf?.hiddenPolicy ?? true;

            config.pdf = {
                enabled: pdfArg || pdfEnabled,
                hiddenPolicy,
            };

            return config;
        });

        getBuildHooks(program)
            .Entry.for('html')
            .tap('PdfPage', (run, entry, info) => {
                if (!run.config.pdf.enabled || !info.html) {
                    return;
                }

                const isHiddenPolicy = run.config.pdf.hiddenPolicy;

                const toc = run.toc.for(entry);
                const meta = info.meta || {};

                // Removing all hidden items, including child ones
                if (isHiddenPolicy && isEntryHidden(toc, entry)) {
                    return;
                }

                run.meta.addMetadata(toc.path, meta.metadata);
                run.meta.addResources(toc.path, meta);

                results[entry] = results[entry] || [];
                results[entry] = {
                    path: entry,
                    content: info.html,
                    title: info.title || '',
                };
            });

        getBuildHooks(program)
            .BeforeRun.for('md')
            .tapPromise('PdfTitlePage', async (run) => {
                if (!run.config.pdf.enabled) {
                    return;
                }

                getTocHooks(run.toc).Loaded.tapPromise({name: 'pdfTitle'}, async (loadedToc) => {
                    const pdfStartPages = loadedToc?.pdf?.startPages;

                    if (pdfStartPages) {
                        const tocLikeEntries = pdfStartPages.map((page) => ({href: page}));

                        // We want to treat pdf start pages as regular entries for arc CI
                        run.toc.pushAdditionalEntries(loadedToc.path, {
                            items: tocLikeEntries,
                            path: loadedToc.path,
                        } as Toc);
                    }
                });
            });

        getBuildHooks(program)
            .BeforeRun.for('html')
            .tap('PdfPage', (run) => {
                if (!run.config.pdf.enabled) {
                    return;
                }

                getLeadingHook(run.leading).Resolved.tapPromise(
                    'pdf',
                    async (content, _meta, file) => {
                        const html = createServerPageConstructorContent(content as PageContent);

                        results[file] = {
                            path: file,
                            content: replacePCNestedLinks(html),
                            title: '',
                        };
                    },
                );

                getTocHooks(run.toc).Loaded.tapPromise({name: 'pdf'}, async (toc) => {
                    const isHiddenPolicy = run.config.pdf.hiddenPolicy;

                    const path = toc.path;

                    await run.toc.walkEntries(toc?.items as EntryTocItem[], async (item) => {
                        if (isHiddenPolicy && item.hidden) {
                            return;
                        }

                        const entryPath = normalizePath(join(dirname(path), item.href));
                        pdfLinks.push(entryPath);

                        return item;
                    });
                });

                // Modify and dump toc for pdf page.
                // Add link to dumped pdf-page-toc.js to html template.
                getEntryHooks(run.entry).Page.tapPromise('Html', async (template) => {
                    if (!template.is(__PdfPage__)) {
                        return;
                    }

                    const pdfTocPath = `${PDF_DIRNAME}/${PDF_TOC_FILENAME}`;
                    const file = join(dirname(template.path), pdfTocPath);

                    const tocPath = join(dirname(template.path), 'toc.yaml');
                    const toc = (await run.toc.dump(tocPath)).copy(file);

                    await run.toc.walkEntries([toc.data as {href: NormalizedPath}], (item) => {
                        item.href = getPdfUrl('.', item.href);

                        return item;
                    });

                    template.addScript(PDF_PAGE_FILENAME, {position: 'state'});

                    await run.write(join(run.output, toc.path), toc.toString(), true);
                });
            });

        getBuildHooks(program)
            .AfterRun.for('html')
            .tapPromise('PdfPage', async (run) => {
                if (!run.config.pdf.enabled) {
                    return;
                }

                for (const toc of run.toc.tocs) {
                    const entries: PdfPageResult[] = [];
                    const pdfStartPages: PdfPageResult[] = [];

                    // First we want to process pdf title pages
                    for (const page of toc.pdf?.startPages || []) {
                        const normalizedPath = normalizePath(join(dirname(toc.path), page));
                        const mdPage = await run.markdown.dump(normalizedPath);
                        pdfStartPages.push({
                            path: page,
                            content: mdPage.data,
                        });
                    }

                    await run.toc.walkEntries([toc as unknown as EntryTocItem], (item) => {
                        const rebasedItemHref = normalizePath(join(dirname(toc.path), item.href));

                        // Results have already been filtered
                        const entry = results[rebasedItemHref];

                        if (entry) {
                            entries.push(entry);
                        }

                        return item;
                    });

                    if (!entries.length) {
                        return;
                    }

                    const tocDir = dirname(toc.path);
                    const htmlPath = join(tocDir, PDF_PAGE_FILENAME);
                    const pdfDataPath = join(tocDir, PDF_DIRNAME, PDF_PAGE_DATA_FILENAME);

                    try {
                        const pdfStartPagesContent = joinPdfPageResults(
                            pdfStartPages.filter(Boolean),
                            tocDir as NormalizedPath,
                            pdfLinks,
                        );

                        const pdfPageBody = joinPdfPageResults(
                            entries.filter(Boolean),
                            tocDir as NormalizedPath,
                            pdfLinks,
                        );

                        const tocData = (await run.toc.dump(toc.path, toc)).data;

                        run.meta.addResources(toc.path, run.config.resources);

                        const data = {
                            leading: false as const,
                            pdfTitlePages: {
                                content: pdfStartPagesContent,
                                pageCount: pdfStartPages.length,
                            },
                            cssLink: run.manifest.app.css.map((file: string) =>
                                join(BUNDLE_FOLDER, file),
                            ),
                            html: pdfPageBody,
                            headings: [],
                            meta: await run.meta.dump(toc.path),
                            title: toc.title || '',
                        };

                        const state = await run.entry.state(htmlPath, data);
                        const template = new Template(htmlPath, state.lang, [__PdfPage__]);
                        const page = await run.entry.page(template, state, tocData);

                        state.data.toc = tocData;

                        const pdfHtmlPath = join(tocDir, PDF_DIRNAME, PDF_PAGE_FILENAME);

                        await run.write(join(run.output, pdfDataPath), JSON.stringify(state), true);
                        await run.write(join(run.output, pdfHtmlPath), page, true);
                    } catch (error) {
                        run.logger.error(error);
                    }
                }
            });

        getBuildHooks(program)
            .AfterRun.for('md')
            .tapPromise('PdfPageCssDependencies', async (run) => {
                if (!run.config.pdf.enabled) {
                    return;
                }

                const {resources} = run.config;
                const cssFiles = resources.style || [];

                for (const file of cssFiles) {
                    try {
                        const cssContent = await run.read(join(run.input, file));
                        const cssDependencies = findCssDependencies(
                            cssContent,
                            file as RelativePath,
                        );

                        for (const cssDep of cssDependencies) {
                            const depPath = cssDep.path;
                            try {
                                await run.copy(join(run.input, depPath), join(run.output, depPath));
                            } catch (depError) {
                                run.logger.warn(
                                    `Unable to copy CSS dependency ${depPath}: ${depError}`,
                                );
                            }
                        }
                    } catch (cssError) {
                        run.logger.warn(
                            `Failed to process CSS dependencies for ${file}: ${cssError}`,
                        );
                    }
                }
            });
    }
}

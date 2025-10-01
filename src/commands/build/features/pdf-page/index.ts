import type {Build} from '~/commands/build';
import type {PdfPageResult} from './utils';
import type { EntryTocItem} from '~/core/toc';

import {dirname, join} from 'node:path';

import {PDF_PAGE_FILENAME, getPdfPageUrl, isEntryHidden, joinPdfPageResults} from './utils';

import {getHooks as getBuildHooks, getEntryHooks} from '~/commands/build';
import {getHooks as getTocHooks} from '~/core/toc';
import {Template} from '~/core/template';
import { normalizePath } from '~/core/utils';

const PDF_DIRNAME = 'pdf';
const PDF_PAGE_DATA_FILENAME = 'pdf-page.json';
const PDF_TOC_FILENAME = 'pdf-page-toc.js';

const __PdfPage__ = Symbol('isPdfPage');

export class PdfPage {
    results: Record<NormalizedPath, PdfPageResult> = {};
    pdfLinks: string[] = [];

    apply(program: Build) {
        getBuildHooks(program)
            .BeforeRun.for('html')
            .tap('Pdf', (run) => {
                getTocHooks(run.toc).Loaded.tapPromise({name: 'pdf'}, async (toc) => {
                    const isHiddenPolicy = run.config?.pdf?.hiddenPolicy ?? true;

                    const path = toc.path;

                    await run.toc.walkEntries(toc?.items as EntryTocItem[],  async (item) => {
                        if (isHiddenPolicy && item.hidden) {
                            return;
                        }

                        const entryPath = normalizePath(join(dirname(path), item.href));
                        this.pdfLinks.push(entryPath);

                        return item
                    })
                })
            })
            

        getBuildHooks(program)
            .Entry.for('html')
            .tap('PdfPage', (run, entry, info) => {
                if (!run.config?.pdf?.enabled || !info.html) {
                    return;
                }

                const isHiddenPolicy = run.config?.pdf?.hiddenPolicy ?? true;

                const toc = run.toc.for(entry);
                const meta = info.meta || {};

                // Removing all hidden items, including child ones
                if (isHiddenPolicy && isEntryHidden(toc, entry)) {
                    return;
                }

                run.meta.addMetadata(toc.path, meta.metadata);
                run.meta.addResources(toc.path, meta);

                this.results[entry] = this.results[entry] || [];
                this.results[entry] = {
                    path: entry,
                    content: info.html,
                    title: info.title || '',
                };
            });

        getBuildHooks(program)
            .BeforeRun.for('html')
            .tap('PdfPage', (run) => {
                if (!run.config?.pdf?.enabled) {
                    return;
                }

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
                        item.href = getPdfPageUrl(dirname(toc.path), item.href);

                        return item;
                    });

                    template.addScript(file, {position: 'state'});

                    await run.write(join(run.output, toc.path), toc.toString(), true);
                });
            });

        getBuildHooks(program)
            .AfterRun.for('html')
            .tapPromise('PdfPage', async (run) => {
                if (!run.config?.pdf?.enabled) {
                    return;
                }

                for (const toc of run.toc.tocs) {
                    const entries: PdfPageResult[] = [];

                    // if (!entries.length) {
                    //     return;
                    // }

                    const tocDir = dirname(toc.path);
                    const htmlPath = join(tocDir, PDF_PAGE_FILENAME);
                    const pdfDataPath = join(tocDir, PDF_DIRNAME, PDF_PAGE_DATA_FILENAME);

                    try {
                        const pdfPageBody = joinPdfPageResults(
                            entries.filter(Boolean),
                            tocDir as NormalizedPath,
                            this.pdfLinks,
                        );

                        const tocData = (await run.toc.dump(toc.path, toc)).data;

                        run.meta.addResources(toc.path, run.config.resources);

                        const data = {
                            leading: false as const,
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
    }
}

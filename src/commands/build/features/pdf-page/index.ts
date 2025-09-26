import type {Build} from '~/commands/build';
import type {EntryTocItem} from '~/core/toc';
import type {PdfPageResult} from './utils';

import {dirname, join} from 'node:path';

import {getHooks as getBuildHooks, getEntryHooks} from '~/commands/build';
import {normalizePath} from '~/core/utils';
import {Template} from '~/core/template';

import {PDF_PAGE_FILENAME, getPdfPageUrl, joinPdfPageResults} from './utils';

const PDF_PAGE_DATA_FILENAME = 'pdf-page.json';

const PDF_TOC_FILENAME = 'pdf-page-toc.js';

const __PdfPage__ = Symbol('isPdfPage');

export class PdfPage {
    apply(program: Build) {
        const results: Record<NormalizedPath, PdfPageResult> = {};

        getBuildHooks(program)
            .Entry.for('html')
            .tap('PdfPage', (run, entry, info) => {
                if (!run.config.preparePdf || !info.html) {
                    return;
                }

                const toc = run.toc.for(entry);
                const meta = info.meta || {};

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
            .BeforeRun.for('html')
            .tap('PdfPage', (run) => {
                if (!run.config.preparePdf) {
                    return;
                }

                // Modify and dump toc for pdf page.
                // Add link to dumped pdf-page-toc.js to html template.
                getEntryHooks(run.entry).Page.tapPromise('Html', async (template) => {
                    if (!template.is(__PdfPage__)) {
                        return;
                    }

                    const file = join(dirname(template.path), PDF_TOC_FILENAME);

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
                if (!run.config.preparePdf) {
                    return;
                }

                for (const toc of run.toc.tocs) {
                    const entries: PdfPageResult[] = [];

                    const hiddenPolicy = run.config.hiddenPolicy;
                    const isHiddenPolicy = hiddenPolicy?.pdf ?? true;

                    await run.toc.walkEntries([toc as unknown as EntryTocItem], (item) => {
                        if (item.hidden && isHiddenPolicy) {
                            return;
                        }

                        const rebasedItemHref = normalizePath(
                            join(dirname(toc.path), item.href),
                        );

                        entries.push(results[rebasedItemHref]);

                        return item;
                    });

                    if (!entries.length) {
                        return;
                    }

                    const tocDir = dirname(toc.path);
                    const htmlPath = join(tocDir, PDF_PAGE_FILENAME);
                    const pdfDataPath = join(tocDir, PDF_PAGE_DATA_FILENAME);

                    try {
                        const pdfPageBody = joinPdfPageResults(
                            entries.filter(Boolean),
                            tocDir as NormalizedPath,
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

                        await run.write(join(run.output, pdfDataPath), JSON.stringify(state), true);
                        await run.write(join(run.output, htmlPath), page, true);
                    } catch (error) {
                        run.logger.error(error);
                    }
                }
            });
    }
}

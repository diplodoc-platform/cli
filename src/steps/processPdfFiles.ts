import walkSync from 'walk-sync';
import puppeteer from 'puppeteer-core';
import {resolve, join, dirname} from 'path';
import {mapLimit, asyncify} from 'async';
import {log} from '@doc-tools/transform/lib/log';
import {readFileSync, writeFileSync} from 'fs';
import {prepareHtmlForPrintMode} from '@doc-tools/transform/lib/utils';
// @ts-ignore
import chromiumResolver from 'puppeteer-chromium-resolver';

import {
    generatePdfStaticMarkup,
    prepareGlobs,
} from '../utils';
import {
    PDF_FILENAME,
    PDF_SOURCE_FILENAME,
    CHROMIUM_RESOLVER_OPTIONS,
    PUPPETEER_PAGE_OPTIONS,
} from '../constants';
import {ArgvService} from '../services';


export async function processPdfFiles() {
    const {
        userOutputFolder,
        pdfIncludeDirs,
        pdfExcludeDirs,
    } = ArgvService.getConfig();

    const globs = prepareGlobs(pdfIncludeDirs);
    const ignore = prepareGlobs(pdfExcludeDirs);

    const singlePagePaths: string[] = walkSync(userOutputFolder, {
        directories: false,
        includeBasePath: false,
        globs,
        ignore,
    });

    const stats = await chromiumResolver(CHROMIUM_RESOLVER_OPTIONS);

    const browser = await puppeteer.launch({
        executablePath: stats.executablePath,
    }).catch((error) => {
        log.error(error);
        return;
    });

    await mapLimit(singlePagePaths, 5, asyncify(async (singlePagePath: string) => {
        const fullSinglePagePath = resolve(userOutputFolder, singlePagePath);
        const singlePageData = readFileSync(fullSinglePagePath, 'utf8');
        const parsedSinglePageData = JSON.parse(singlePageData);

        const pdfFileBody = prepareHtmlForPrintMode(parsedSinglePageData.data.html);
        const pdfFileContent = await generatePdfStaticMarkup(pdfFileBody);

        const pdfDirPath = dirname(fullSinglePagePath);
        const pdfFileSourcePath = join(pdfDirPath, PDF_SOURCE_FILENAME);

        writeFileSync(pdfFileSourcePath, pdfFileContent);

        try {
            const page = await browser.newPage();

            await page.goto(`file://${pdfFileSourcePath}`, {
                waitUntil: 'networkidle2',
            });

            const fullPdfFilePath = join(pdfDirPath, PDF_FILENAME);

            await page.pdf({
                path: fullPdfFilePath,
                ...PUPPETEER_PAGE_OPTIONS,
            });

            await page.close();
        } catch {
            log.warn(`The PDF file is too large. Tried to generate from ${fullSinglePagePath}.`);
        }

        await browser.close();
    }));
}

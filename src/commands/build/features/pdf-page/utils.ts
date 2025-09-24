import { getSinglePageUrl, joinSinglePageResults, SinglePageResult} from '../singlepage/utils';

export const PDF_PAGE_FILENAME = 'pdf-page.html';

export type PdfPageResult = SinglePageResult;

export function getPdfPageUrl(tocDir: string, path: string): NormalizedPath {
    return getSinglePageUrl(tocDir, path, PDF_PAGE_FILENAME);
}

export function joinPdfPageResults(
    pdfPageResults: PdfPageResult[],
    tocDir: NormalizedPath,
): string {
    return joinSinglePageResults(pdfPageResults, tocDir);
}

import {normalizePath} from '~/core/utils';
import {Toc} from '~/core/toc';

import {getSinglePageUrl, joinSinglePageResults} from '../singlepage/utils';
import {dirname, join} from 'node:path';

export const PDF_PAGE_FILENAME = 'pdf-page.html';

export interface PdfPageResult {
    path: string;
    content: string;
    title?: string;
}

// Let's leave the import for now; this function can be overridden later
export function getPdfPageUrl(tocDir: string, path: string): NormalizedPath {
    return getSinglePageUrl(tocDir, path, PDF_PAGE_FILENAME);
}

export function joinPdfPageResults(
    pdfPageResults: PdfPageResult[],
    tocDir: NormalizedPath,
): string {
    return joinSinglePageResults(pdfPageResults, tocDir);
}

function checkItems(toc: Toc, entryPath: string, items: any[], parentHidden: boolean): boolean | null {
    if (!items) return null;
        
    for (const item of items) {
        const isCurrentHidden = item.hidden || parentHidden;
            
        if (item.href) {
            const itemPath = normalizePath(join(dirname(toc.path), item.href));
                
            if (itemPath === entryPath) {
                return isCurrentHidden;
            }
        }
            
        if (item.items && item.items.length > 0) {
            const result = checkItems(toc, entryPath, item.items, isCurrentHidden);

            if (result !== null) {
                return result;
            }
        }
    }
        
    return null;
}

export function isEntryHidden(toc: Toc, entryPath: NormalizedPath): boolean {
    const result = checkItems(toc, entryPath, toc.items || [], false);
    
    return result === true;
}

export function removeTags(html: string, classList?: string[]) {
    if (!classList || classList.length === 0) {
        return html;
    }

    const classes = classList.map(cls => cls.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

    const classPattern = classes.length === 1
        ? `\\b${classes[0]}\\b`
        : `\\b(?:${classes.join('|')})\\b`;

    const re = new RegExp(
      `<([a-zA-Z0-9]+)([^>]*)\\bclass\\s*=\\s*(['"])([^'"]*${classPattern}[^'"]*)\\3[^>]*>[\\s\\S]*?<\\/\\1>`,
      'gi'
    );

    return html.replace(re, '');
}

import {compose} from '@diplodoc/translation';

export const TABLE_TITLE_CONTEXT = 'data-yfm-context="wide-table-title"';
const FALLBACK = 'data-yfm-title-fallback="true"';

/** Keep context in the unit/cache key, never in the model-facing prose. */
export function markTableTitle(unit: string): string {
    return unit.replace(/^<source\b/, `<source ${TABLE_TITLE_CONTEXT}`);
}

export function isTableTitleUnit(unit: string): boolean {
    return unit.slice(0, unit.indexOf('>')).includes(TABLE_TITLE_CONTEXT);
}

/** Delegate attribute syntax validation to the translation library. */
export function tableTitleIssue(source: string, translation: string): boolean {
    if (!isTableTitleUnit(source)) return false;
    try {
        compose('{wide-content title="%%%0%%%"}', [translation], {useSource: true});
        return false;
    } catch {
        return true;
    }
}

/** Carry rejection to document composition without storing it as a translation. */
export function tableTitleFallback(source: string): string {
    return isTableTitleUnit(source) ? source.replace(/^<source\b/, `<source ${FALLBACK}`) : source;
}

export function isTableTitleFallback(unit: string): boolean {
    return unit.slice(0, unit.indexOf('>')).includes(FALLBACK);
}

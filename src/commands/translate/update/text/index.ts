import type {TextPlan} from './types';

import {normalizeEol, planMarkdown} from './markdown';
import {planToc} from './toc';
import {standaloneInclude} from './yfm-units';

function unchanged(text: string): TextPlan {
    return {
        input: '',
        apply(translated) {
            if (translated.length) {
                throw new Error('Unexpected translation for a structural update');
            }
            return text;
        },
    };
}

/** Plan a scoped update without invoking the translation provider or changing any files. */
export function planText(
    kind: 'markdown' | 'toc',
    before: string | null,
    after: string,
    target: string | null,
): TextPlan {
    if (before === null) {
        const include = kind === 'markdown' ? standaloneInclude(after) : undefined;
        const eol = after.match(/\r\n|\r|\n/)?.[0] ?? '\n';
        const verbatim =
            include === undefined
                ? after
                : ['', ':::no-translate', include, ':::', '', ''].join(eol);
        if (target !== null) {
            if (target === after || target === verbatim) {
                return unchanged(target);
            }
            throw new Error('Target already exists for a newly added source file');
        }
        if (include !== undefined || !after.trim()) {
            return unchanged(verbatim);
        }
        return {
            input: after,
            apply(translated) {
                if (!translated.trim()) {
                    throw new Error('Translation output is empty');
                }
                return translated;
            },
        };
    }
    if (target === null) {
        throw new Error('Existing source file has no target for a scoped update');
    }
    if (normalizeEol(before) === normalizeEol(after)) {
        return unchanged(target);
    }
    return kind === 'markdown'
        ? planMarkdown(before, after, target)
        : planToc(before, after, target);
}

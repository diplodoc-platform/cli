import {get} from 'lodash';

import {normalizePath} from '~/core/utils';

/**
 * Returns a project-relative path for `pdf.icon` when it references
 * a file under `_assets/`. Inline SVG, remote URLs, and other strings are ignored.
 */
export function getPdfIconAssetPath(config: Hash): NormalizedPath | undefined {
    const pdf = get(config, 'pdf');
    if (pdf === null || typeof pdf !== 'object') {
        return;
    }

    const icon = (pdf as {icon?: unknown}).icon;
    if (typeof icon !== 'string') {
        return;
    }

    const trimmed = icon.trim();
    if (!trimmed.startsWith('_assets/')) {
        return;
    }

    const pathOnly = (trimmed.split('?')[0] ?? '').split('#')[0]?.trim() ?? '';
    if (!pathOnly.startsWith('_assets/')) {
        return;
    }

    try {
        const normalized = normalizePath(decodeURIComponent(pathOnly)) as NormalizedPath;
        if (!normalized.startsWith('_assets/')) {
            return;
        }
        if (normalized.includes('..')) {
            return;
        }

        return normalized;
    } catch {
        return;
    }
}

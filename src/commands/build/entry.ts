import type {EntryInfo} from './types';
import type {Run} from './run';

import {resolveToHtml, resolveToMd} from '~/resolvers';

// Processes files of documentation (like index.yaml, *.md)
export async function processEntry(run: Run, entry: NormalizedPath): Promise<EntryInfo> {
    const {outputFormat} = run.config;

    const resolver = outputFormat === 'html' ? resolveToHtml : resolveToMd;

    // Add generator meta tag with versions
    run.meta.add(entry, {
        metadata: {
            generator: `Diplodoc Platform v${VERSION}`,
        },
    });

    return resolver(run, entry);
}

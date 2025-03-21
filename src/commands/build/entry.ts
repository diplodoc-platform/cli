import type {EntryInfo} from './types';
import type {Run} from './run';

import {join} from 'node:path';
import {bold} from 'chalk';

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

    try {
        return resolver(run, entry);
    } catch (error) {
        const message = `No such file or has no access to ${bold(join(run.input, entry))}`;

        run.logger.error(message);
        console.error(message, error);

        return {};
    }
}

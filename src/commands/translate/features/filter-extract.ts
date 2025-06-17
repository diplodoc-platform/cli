import type {ICallable} from '~/core/program/types';
import type {Meta} from '~/core/meta';
import type {Extract} from '../commands/extract';

import {getHooks as getExtractHooks} from '../commands/hooks';
import {getHooks as getMarkdownHooks} from '~/core/markdown';
import {getHooks as getTocHooks} from '~/core/toc';
import {dirname, extname, join} from 'node:path';
import {normalizePath} from '~/core/utils';

export class FilterExtract implements ICallable {
    private removedEntries: Set<NormalizedPath> = new Set();

    apply(program: Extract) {
        getExtractHooks(program).BeforeRun.tap('FilterExtract', (run) => {
            getTocHooks(run.toc).Filtered.tap('FilterExtract', (path: NormalizedPath) => {
                this.removedEntries.add(path);
            });

            getMarkdownHooks(run.markdown).Loaded.tapPromise(
                'FilterExtract',
                async (raw: string, _meta: Meta, file: NormalizedPath) => {
                    if (extname(file) === '.md' && run.config.filter) {
                        const linkRegex = /\[.*?\]\((.*?\.md|yaml)(?:\s.*?)?\)/g;
                        let match;
                        const fileDir = dirname(file);

                        while ((match = linkRegex.exec(raw)) !== null) {
                            const relativeLink = match[1];

                            const absoluteLink = normalizePath(join(fileDir, relativeLink));

                            if (this.removedEntries.has(absoluteLink)) {
                                run.logger.warn(
                                    `Warning: File ${file} contains a link to ${relativeLink} (absolute path: ${absoluteLink}), which was filtered from toc.yaml`,
                                );
                            }
                        }
                    }
                },
            );
        });
    }
}

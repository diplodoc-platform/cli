import type {Extract} from '../commands/extract';

import {getHooks as getExtractHooks} from '../commands/hooks';
import {getHooks as getMarkdownHooks} from '~/core/markdown';
import {getHooks as getTocHooks} from '~/core/toc';

export class FilterExtract {
    private removedEntries: Set<NormalizedPath> = new Set();

    apply(program: Extract) {
        getExtractHooks(program).BeforeRun.tap('FilterExtract', (run) => {
            getTocHooks(run.toc).Filtered.tap('FilterExtract', (path: NormalizedPath) => {
                this.removedEntries.add(path);
            });

            getMarkdownHooks(run.markdown).Resolved.tapPromise(
                'FilterExtract',
                async (_content, path) => {
                    if (run.config.filter) {
                        const assets = await run.markdown.assets(path as RelativePath);

                        for (const asset of assets) {
                            if (asset.type === 'link' && this.removedEntries.has(asset.path)) {
                                run.logger.warn(
                                    `File ${path} contains link to ${asset.path}, which was filtered from toc.yaml`,
                                );
                            }
                        }
                    }
                },
            );
        });
    }
}

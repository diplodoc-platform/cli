import type {Extract} from '../commands/extract';
import type {Run} from '../run';

import {getHooks as getExtractHooks} from '../commands/hooks';
import {getHooks as getMarkdownHooks} from '~/core/markdown';

export class FilterExtract {
    private missedEntries: Set<[string, string]> = new Set();

    apply(program: Extract) {
        getExtractHooks(program).BeforeRun.tap('FilterExtract', (run) => {
            getMarkdownHooks(run.markdown).Resolved.tapPromise(
                'FilterExtract',
                async (_content, path) => {
                    if (!run.config.filter) {
                        return;
                    }

                    const assets = await run.markdown.assets(path as RelativePath);

                    for (const asset of assets) {
                        if (
                            asset.type === 'link' &&
                            // No entry in the TOC means we filtered or missed it
                            !run.toc.entries.includes(asset.path)
                        ) {
                            this.missedEntries.add([path, asset.path]);
                        }
                    }

                    if (this.missedEntries.size > 0) {
                        this.logMissedEntries(run);

                        process.exit(1);
                    }
                },
            );
        });
    }

    private getErrorMessage(source: string, link: string) {
        return `File ${source} contains link to ${link}, which was filtered from toc.yaml or it's not been included initially`;
    }

    private logMissedEntries(run: Run) {
        for (const [key, value] of this.missedEntries) {
            run.logger.error(this.getErrorMessage(key, value));
        }
    }
}

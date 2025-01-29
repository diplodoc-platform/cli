import type {Build} from '~/commands/build';
import type {Toc, TocItem} from '~/core/toc';

import {basename, dirname, extname, join} from 'node:path';
import {v4 as uuid} from 'uuid';
import {isExternalHref, normalizePath, own} from '~/core/utils';

import {getHooks as getBuildHooks} from '~/commands/build';
import {getHooks as getTocHooks} from '~/core/toc';

export class Html {
    apply(program: Build) {
        getBuildHooks(program)
            .BeforeRun.for('html')
            .tap('Html', async (run) => {
                getTocHooks(run.toc).Dump.tapPromise('Html', async (toc, path) => {
                    const copy = JSON.parse(JSON.stringify(toc)) as Toc;
                    await run.toc.walkItems([copy], (item: Toc | TocItem) => {
                        item.id = uuid();

                        if (own<string, 'href'>(item, 'href') && !isExternalHref(item.href)) {
                            const fileExtension: string = extname(item.href);
                            const filename: string = basename(item.href, fileExtension) + '.html';

                            item.href = normalizePath(
                                join(dirname(path), dirname(item.href), filename),
                            );
                        }

                        return item;
                    });

                    return copy;
                });

                getTocHooks(run.toc).Resolved.tapPromise('Html', async (_toc, path) => {
                    const file = join(run.output, dirname(path), 'toc.js');
                    const result = await run.toc.dump(path);

                    await run.write(file, `window.__DATA__.data.toc = ${JSON.stringify(result)};`);
                });
            });
    }
}

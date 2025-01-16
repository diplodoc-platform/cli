import type {Build} from '~/commands/build';
import type {Toc, TocItem} from '~/core/toc';

import {basename, dirname, extname, join} from 'node:path';
import {isExternalHref, own} from '~/utils';
import {v4 as uuid} from 'uuid';

export class Html {
    apply(program: Build) {
        program.hooks.BeforeRun.for('html').tap('Html', async (run) => {
            run.toc.hooks.Resolved.tapPromise('Html', async (toc, path) => {
                const copy = JSON.parse(JSON.stringify(toc)) as Toc;
                await run.toc.walkItems([copy], (item: Toc | TocItem) => {
                    item.id = uuid();

                    if (own<string>(item, 'href') && !isExternalHref(item.href)) {
                        const fileExtension: string = extname(item.href);
                        const filename: string = basename(item.href, fileExtension) + '.html';

                        item.href = join(dirname(path), dirname(item.href), filename);
                    }

                    return item;
                });

                const file = join(run.output, dirname(path), 'toc.js');

                await run.write(file, `window.__DATA__.data.toc = ${JSON.stringify(copy)};`);
            });
        });
    }
}

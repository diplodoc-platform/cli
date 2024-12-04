import type {Build} from '../..';

import {basename, dirname, extname, join} from 'path';
import {isExternalHref, own} from '~/utils';
import {dedent} from 'ts-dedent';

export class Html {
    apply(program: Build) {
        program.hooks.BeforeRun.for('html').tap('Html', async (run) => {
            run.toc.hooks.Resolved.tapPromise('Build', async (toc, path) => {
                const copy = toc;
                // const copy = JSON.parse(JSON.stringify(toc)) as Toc;
                await run.toc.walkItems([copy], (item) => {
                    if (own(item, 'href') && !isExternalHref(item.href)) {
                        if (item.href.endsWith('/')) {
                            item.href += 'index.yaml';
                        }

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

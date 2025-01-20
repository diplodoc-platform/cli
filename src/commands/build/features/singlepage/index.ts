import type {Build} from '~/commands/build';
import type {Toc} from '~/core/toc';
import type {Command} from '~/core/config';

import {dirname, join} from 'node:path';

import {getHooks as getBaseHooks} from '~/core/program';
import {getHooks as getBuildHooks} from '~/commands/build';
import {getHooks as getTocHooks} from '~/core/toc';
import {defined} from '~/core/config';
import {isExternalHref, own} from '~/utils';

import {options} from './config';
import {getSinglePageUrl} from './utils';

export type SinglePageArgs = {
    singlePage: boolean;
};

export type SinglePageConfig = {
    singlePage: boolean;
};

export class SinglePage {
    apply(program: Build) {
        getBaseHooks(program).Command.tap('SinglePage', (command: Command) => {
            command.addOption(options.singlePage);
        });

        getBaseHooks(program).Config.tap('SinglePage', (config, args) => {
            config.singlePage = defined('singlePage', args, config) || false;

            return config;
        });

        getBuildHooks(program)
            .BeforeRun.for('html')
            .tap('SinglePage', (run) => {
                if (!run.config.singlePage) {
                    return;
                }

                getTocHooks(run.toc).Resolved.tapPromise('SinglePage', async (toc, path) => {
                    const copy = JSON.parse(JSON.stringify(toc)) as Toc;
                    await run.toc.walkItems([copy], (item) => {
                        if (own<string, 'href'>(item, 'href') && !isExternalHref(item.href)) {
                            item.href = getSinglePageUrl(dirname(path), item.href);
                        }

                        return item;
                    });

                    const file = join(run.output, dirname(path), 'single-page-toc.js');

                    await run.write(file, `window.__DATA__.data.toc = ${JSON.stringify(copy)};`);
                });
            });
    }
}

import type {Build} from '~/commands/build';
import type {Toc} from '~/core/toc';
import type {Command} from '~/config';

import {dirname, join} from 'node:path';

import {getHooks as getBaseHooks} from '~/core/program';
import {defined} from '~/config';
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

        program.hooks.BeforeRun.for('html').tap('SinglePage', (run) => {
            if (!run.config.singlePage) {
                return;
            }

            run.toc.hooks.Resolved.tapPromise('SinglePage', async (toc, path) => {
                const copy = JSON.parse(JSON.stringify(toc)) as Toc;
                await run.toc.walkItems([copy], (item) => {
                    if (own<string>(item, 'href') && !isExternalHref(item.href)) {
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

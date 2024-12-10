import type {Build} from '~/commands';
import type {Command} from '~/config';

import {dirname, join} from 'node:path';
import {dedent} from 'ts-dedent';
import {defined} from '~/config';
import {options} from './config';
import {isExternalHref, own} from '~/utils';

export type SinglePageArgs = {
    singlePage: boolean;
};

export type SinglePageConfig = {
    singlePage: boolean;
};

export class SinglePage {
    apply(program: Build) {
        program.hooks.Command.tap('SinglePage', (command: Command) => {
            command.addOption(options.singlePage);
        });

        program.hooks.Config.tap('SinglePage', (config, args) => {
            config.singlePage = defined('singlePage', args, config) || false;

            return config;
        });

        program.hooks.BeforeRun.for('html').tap('SinglePage', (run) => {
            run.toc.hooks.Resolved.tapPromise('SinglePage', async (toc, path) => {
                const copy = JSON.parse(JSON.stringify(toc)) as Toc;
                await run.toc.walkItems([copy], (item) => {
                    if (own(item, 'href') && !isExternalHref(item.href)) {
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

function dropExt(path: string) {
    return path.replace(/\.(md|ya?ml|html)$/i, '');
}

function toUrl(path: string) {
    // replace windows backslashes
    return path.replace(/\\/g, '/').replace(/^\.\//, '');
}

function relativeTo(root: string, path: string) {
    root = toUrl(root);
    path = toUrl(path);

    if (root && path.startsWith(root + '/')) {
        path = path.replace(root + '/', '');
    }

    return path;
}

function getAnchorId(tocDir: string, path: string) {
    const [pathname, hash] = path.split('#');
    const url = toUrl(dropExt(pathname)) + (hash ? '#' + hash : '');

    // TODO: encodeURIComponent will be best option
    return relativeTo(tocDir, url.replace(/\.\.\/|[/#]/g, '_'));
}

export function getSinglePageUrl(tocDir: string, path: string) {
    const prefix = toUrl(tocDir) || '.';
    const suffix = getAnchorId(tocDir, path);

    if (prefix === '.') {
        return '#' + suffix;
    }

    return prefix + '/single-page.html#' + suffix;
}

import type {Build} from '~/commands/build';

import {ok} from 'node:assert';
import {join} from 'node:path';

import {getHooks as getBuildHooks} from '~/commands/build';
import {REDIRECTS_FILENAME} from '~/constants';
import {configPath, resolveConfig} from '~/core/config';

import {redirect} from './redirect';

interface Redirect {
    from: string;
    to: string;
}

interface RedirectsConfig {
    common: Redirect[];
    [lang: string]: Redirect[];
}

// TODO: should be service, not a feature
export class Redirects {
    apply(program: Build) {
        let resolvedPath: AbsolutePath | null = null;

        getBuildHooks(program)
            .BeforeRun.for('md')
            .tap('Redirects', async (run) => {
                try {
                    const redirects = await resolveConfig<RedirectsConfig>(
                        join(run.originalInput, REDIRECTS_FILENAME),
                        {
                            fallback: {common: []},
                        },
                    );

                    if (redirects[configPath]) {
                        validateRedirects(redirects, redirects[configPath]);
                        resolvedPath = redirects[configPath];
                    }
                    // eslint-disable-next-line  @typescript-eslint/no-explicit-any
                } catch (error: any) {
                    run.logger.error(error.message || error);
                }
            });

        getBuildHooks(program)
            .AfterRun.for('md')
            .tapPromise('Redirects', async (run) => {
                if (resolvedPath) {
                    await run.copy(resolvedPath, join(run.output, REDIRECTS_FILENAME));
                }
            });

        getBuildHooks(program)
            .AfterRun.for('html')
            .tapPromise('Redirects', async (run) => {
                const langRelativePath = `./${run.config.lang}/index.html`;
                const langPath = join(run.output, langRelativePath);
                const pagePath = join(run.output, 'index.html');

                if (!run.exists(pagePath) && run.exists(langPath)) {
                    const content = redirect(run.config.lang, langRelativePath);
                    await run.write(pagePath, content);
                }
            });
    }
}

function validateRedirects(redirectsConfig: RedirectsConfig, pathToRedirects: string) {
    const redirects: Redirect[] = Object.keys(redirectsConfig).reduce(
        (res, redirectSectionName) => {
            const sectionRedirects = redirectsConfig[redirectSectionName];
            res.push(...sectionRedirects);
            return res;
        },
        [] as Redirect[],
    );

    const getContext = (from: string, to: string) => ` [Context: \n- from: ${from}\n- to: ${to} ]`;
    const formatMessage = (message: string, pathname: string, from: string, to: string) =>
        `${pathname}: ${message} ${getContext(from, to)}`;

    redirects.forEach(({from, to}) => {
        ok(
            from && to,
            formatMessage('One of the two parameters is missing', pathToRedirects, from, to),
        );
        ok(from !== to, formatMessage('Parameters must be different', pathToRedirects, from, to));
    });
}

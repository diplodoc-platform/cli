import type {Run} from '../../run';
import type {Redirect, Redirects} from './types';

import {ok} from 'node:assert';
import {join} from 'node:path';
import {difference} from 'lodash';
import {dump} from 'js-yaml';
import { dedent } from 'ts-dedent';

import {resolveConfig} from '~/core/config';

import {getHooks, withHooks} from './hooks';
import {RTL_LANGS} from '~/constants';

export const REDIRECTS_FILENAME = 'redirects.yaml';

@withHooks
export class RedirectsService {
    get files() {
        return this.redirects?.files || [];
    }

    private run: Run;

    private redirects: Redirects | null = null;

    constructor(run: Run) {
        this.run = run;
    }

    async init() {
        try {
            const redirects = await resolveConfig<Redirects>(
                join(this.run.originalInput, REDIRECTS_FILENAME),
                {
                    fallback: {},
                },
            );

            this.validate(redirects);

            this.redirects = redirects;
        } catch (error) {
            this.run.logger.error(error);
            this.redirects = null;
        }
    }

    async release() {
        const redirects = await getHooks(this).Release.promise(this.redirects);

        if (redirects && Object.keys(redirects).length) {
            await this.run.write(join(this.run.output, REDIRECTS_FILENAME), dump(redirects));
        }
    }

    async page(lang: string, link: string) {
        const isRTL = RTL_LANGS.includes(lang);

        return dedent`
            <!DOCTYPE html>
            <html lang="${lang}" dir="${isRTL ? 'rtl' : 'ltr'}">
                <head>
                    <meta charset="utf-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <meta http-equiv="refresh" content="0; url=${link}">
                    <title>Redirect</title>
                    <style type="text/css">
                        body {height: 100vh;}
                    </style>
                    <script type="text/javascript">
                        window.location.replace("${link}");
                    </script>
                </head>
                <body class="g-root g-root_theme_light">
                    If you are not redirected automatically, follow this <a href="${link}">link</a>.
                </body>
            </html>
        `;
    }

    private validate(redirects: Redirects) {
        const getContext = (from: string, to: string) =>
            ` [Context: \n- from: ${from}\n- to: ${to} ]`;
        const formatMessage = (message: string, section: string, from: string, to: string) =>
            `${REDIRECTS_FILENAME}#${section}: ${message} ${getContext(from, to)}`;

        const sections: string[] = difference(Object.keys(redirects), ['vcs']);

        for (const key of sections) {
            const section = redirects[key] as Redirect[];
            for (const {from, to} of section) {
                ok(
                    from && to,
                    formatMessage('One of the two parameters is missing', key, from, to),
                );
                ok(from !== to, formatMessage('Parameters must be different', key, from, to));
            }
        }
    }
}

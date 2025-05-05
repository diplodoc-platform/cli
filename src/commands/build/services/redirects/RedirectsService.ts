import type {Run} from '../../run';
import type {Redirect, Redirects} from './types';

import {ok} from 'node:assert';
import {join} from 'node:path';
import {difference} from 'lodash';
import {dump} from 'js-yaml';

import {Template} from '~/core/template';
import {resolveConfig} from '~/core/config';
import {langFromPath} from '~/core/utils';

import {getHooks, withHooks} from './hooks';

export const REDIRECTS_FILENAME = 'redirects.yaml';

@withHooks
export class RedirectsService {
    get files() {
        return this.redirects?.files || [];
    }

    private run: Run;

    private config: Run['config'];

    private redirects: Redirects | null = null;

    constructor(run: Run) {
        this.run = run;
        this.config = this.run.config;
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

    async page(from: RelativePath, to: RelativePath) {
        const lang = langFromPath(from, this.config);
        const template = new Template(from, lang);

        template
            .setTitle(`Redirect to ${to}`)
            .addMeta({'http-equiv': 'refresh', content: `0; url=${to}`})
            .addScript(`window.location.replace("${to}");`, {inline: true, position: 'leading'})
            .addBody(
                `If you are not redirected automatically, follow this <a href="${to}">link</a>.`,
            );

        await getHooks(this).Page.promise(template);

        return template.dump();
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

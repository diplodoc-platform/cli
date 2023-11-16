import {ok} from 'node:assert';
import {resolve} from 'node:path';
import {readFile} from 'node:fs/promises';
import {load} from 'js-yaml';
import shell from 'shelljs';
import {Build, OutputFormat} from '../../index';

import {REDIRECTS_FILENAME} from '../../../../constants';

interface Redirect {
    from: string;
    to: string;
}

interface RedirectsConfig {
    common: Redirect[];
    [lang: string]: Redirect[];
}

export class Redirects {
    apply(program: Build) {
        let resolvedPath: string | null = null;

        program.hooks.BeforeRun.for('md').tap('Redirects', async (run) => {
            try {
                resolvedPath = await resolveRedirects(run.root);
            } catch (error) {
                run.logger.error(error);
            }
        });

        program.hooks.AfterRun.for('md').tap('Redirects', async (run) => {
            if (resolvedPath) {
                shell.cp(resolvedPath, run.output);
            }
        });
    }
}

async function resolveRedirects(root: string) {
    const filepath = resolve(root, REDIRECTS_FILENAME);

    try {
        const redirectsContent = await readFile(filepath, 'utf8');
        const redirects = load(redirectsContent);

        validateRedirects(redirects as RedirectsConfig, filepath);

        return filepath;
    } catch (error: any) {
        if (error.name === 'YAMLException') {
            throw `Failed to parse ${REDIRECTS_FILENAME}: ${error.message}`;
        }

        if (error.code === 'ENOENT') {
            return null;
        }

        throw error;
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
        ok(from && to, formatMessage('One of the two parameters is missing', pathToRedirects, from, to));
        ok(from !== to, formatMessage('Parameters must be different', pathToRedirects, from, to));
    });
}

import type {ContentConfig} from './types';

import {dirname, isAbsolute, relative, resolve} from 'node:path';
import {existsSync, statSync} from 'node:fs';
import {ok} from 'node:assert';
import {merge} from 'lodash';

import {configPath} from '~/core/config';
import {normalizePath} from '~/core/utils';

/**
 * Resolves the project root and the target file for the `content` command and
 * normalizes the shared build config so the build `Run` can consume it.
 *
 * Root selection:
 *  - the directory of the resolved `-c` config if provided;
 *  - otherwise the current working directory;
 *  - if the target file lives outside that root, the file's own directory is
 *    used as a fallback (so includes/presets resolution does not break).
 *
 * The original `-c` output (`config.output`) is preserved as `config.outputFile`
 * before `output` is repurposed as a project scope. Mutates and returns `config`.
 */
export function resolveContentConfig(
    config: ContentConfig,
    cwd: string = process.cwd(),
): ContentConfig {
    const targetFile = (
        isAbsolute(config.input) ? config.input : resolve(cwd, config.input)
    ) as AbsolutePath;

    ok(
        existsSync(targetFile) && statSync(targetFile).isFile(),
        `Expected a single input file via -i/--input, got: ${config.input}`,
    );

    const cfgPath = config[configPath];
    let root = (cfgPath ? dirname(cfgPath) : cwd) as AbsolutePath;

    let rel = relative(root, targetFile);
    // The single file must live inside the project root; otherwise presets/includes
    // resolution breaks. Fall back to the file's own directory as the root.
    if (rel.startsWith('..') || isAbsolute(rel)) {
        root = dirname(targetFile) as AbsolutePath;
        rel = relative(root, targetFile);
    }

    // Preserve the user-specified output file before repurposing `output` as a scope.
    config.outputFile = config.output;

    config.file = normalizePath(rel);
    config.input = root;
    // `output` is only used as a project scope for the build Run; we never write there.
    config.output = root;
    // Do not copy input into `.tmp_input`; read straight from the root.
    config.originAsInput = true;
    // Keep stdout clean: suppress INFO topics, warnings/errors still go to stderr.
    config.quiet = true;

    // The `Templating` feature (build-only) usually fills `config.template`,
    // which the markdown loader relies on. Replicate its defaults here so a
    // standalone content build behaves like the corresponding build.
    const rawTemplate = (config as {template?: unknown}).template;
    config.template = merge(
        {
            enabled: rawTemplate !== false,
            keepNotVar: false,
            legacyConditions: false,
            scopes: {text: true, code: false},
            features: {substitutions: true, conditions: true, cycles: true},
        },
        typeof rawTemplate === 'object' && rawTemplate ? rawTemplate : {},
    );

    return config;
}

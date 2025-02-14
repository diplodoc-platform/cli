import type {Run} from '~/commands/build';

import {dirname, join} from 'node:path';
import {cloneDeepWith} from 'lodash';
import {extractFrontMatter} from '@diplodoc/transform/lib/frontmatter';
import {liquidSnippet} from '@diplodoc/transform/lib/liquid';

import {normalizePath, own} from '~/core/utils';

// Include example: {% include [createfolder](create-folder.md) %}
// Regexp result: [createfolder](create-folder.md)
const REGEXP_INCLUDE_CONTENTS = /(?<=[{%]\sinclude\s).+(?=\s[%}])/gm;

// Include example: [createfolder](create-folder.md)
// Regexp result: create-folder.md
const REGEXP_INCLUDE_FILE_PATH = /(?<=[(]).+(?=[)])/g;

export async function mangleFrontMatter(run: Run, path: RelativePath) {
    const file = normalizePath(path);
    const rawContent = await run.read(join(run.input, path));
    const [rawFrontmatter, content] = extractFrontMatter(rawContent, file);
    const deps = await getIncludes(run, file, content);
    const vars = await run.vars.load(path);

    const frontmatter = cloneDeepWith(rawFrontmatter, (value: unknown) =>
        typeof value === 'string'
            ? liquidSnippet(value, vars, path, {
                  substitutions: run.config.template.features.substitutions,
                  conditions: run.config.template.features.conditions,
                  keepNotVar: true,
                  withSourceMap: false,
              })
            : undefined,
    );

    run.meta.addMetadata(path, vars.__metadata);
    run.meta.addSystemVars(path, vars.__system);
    run.meta.addResources(path, run.config.resources);

    const meta = run.meta.add(path, frontmatter);

    run.meta.add(path, await run.vcs.metadata(path, meta, deps));

    return content;
}

async function getIncludes(
    run: Run,
    path: NormalizedPath,
    content: string,
    results = new Set<NormalizedPath>(),
): Promise<NormalizedPath[]> {
    const includes = content.match(REGEXP_INCLUDE_CONTENTS);
    if (!includes || includes.length === 0) {
        return [...results];
    }

    const includesPaths = getIncludesPaths(path, includes);
    for (const includePath of includesPaths) {
        if (results.has(includePath)) {
            continue;
        }
        results.add(includePath);

        try {
            const includeContent = await run.read(join(run.input, includePath));

            await getIncludes(run, includePath, includeContent, results);
        } catch (error) {
            if (own(error, 'code') && error.code === 'ENOENT') {
                continue;
            }

            throw error;
        }
    }

    return [...results];
}

function getIncludesPaths(path: NormalizedPath, includes: string[]): NormalizedPath[] {
    const results: Set<NormalizedPath> = new Set();

    for (const include of includes) {
        const includeMatch = include.match(REGEXP_INCLUDE_FILE_PATH);

        if (includeMatch && includeMatch.length !== 0) {
            const includePath = includeMatch[0].split('#')[0];

            results.add(normalizePath(join(dirname(path), includePath)));
        }
    }

    return [...results];
}

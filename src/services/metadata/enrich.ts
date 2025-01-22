import type {Meta} from '~/core/meta';
import type {Run} from '~/commands/build';

import {join} from 'node:path';
import {load} from 'js-yaml';
import {cloneDeepWith, omit} from 'lodash';
import {extractFrontMatter as extractMdFrontMatter} from '@diplodoc/transform/lib/frontmatter';
import {liquidSnippet} from '@diplodoc/transform/lib/liquid';

function extractYamlFrontMatter(file: string): [Meta, object] {
    const parsed = load(file);
    const frontmatter = parsed.meta || {};
    const content = omit(parsed, ['meta']);

    return [frontmatter, content];
}

export async function mangleFrontMatter(run: Run, path: RelativePath, ext: string) {
    const vars = await run.vars.load(path);
    const file = await run.read(join(run.input, path));

    const [rawFrontmatter, content] =
        ext === '.yaml' ? extractYamlFrontMatter(file) : extractMdFrontMatter(file, path);

    const shouldAlwaysAddVCSPath = Boolean(run.config.vcs.remoteBase?.length);

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

    run.meta.add(path, frontmatter);
    run.meta.addMetadata(path, vars.__metadata);
    run.meta.addSystemVars(path, vars.__system);
    run.meta.addResources(path, run.config.resources);

    const meta = run.meta.dump(path);

    run.meta.add(path, await run.vcs.metadata(path, meta, content));

    if (shouldAlwaysAddVCSPath) {
        run.meta.add(path, {
            vcsPath: meta.vcsPath || meta.sourcePath || path,
        });
    }

    return content;
}

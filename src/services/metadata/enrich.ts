import type {Meta} from '~/core/meta';
import type {FrontMatter} from '@diplodoc/transform/lib/frontmatter';
import type {Run} from '~/commands/build';

import {join} from 'node:path';
import {load} from 'js-yaml';
import {cloneDeepWith, omit} from 'lodash';
import {extractFrontMatter} from '@diplodoc/transform/lib/frontmatter';
import {liquidSnippet} from '@diplodoc/transform/lib/liquid';

import {resolveVCSFrontMatter} from './vcsMetadata';

const resolveVCSPath = (frontMatter: FrontMatter, relativeInputPath: string) => {
    const maybePreProcessedSourcePath = frontMatter.sourcePath;

    return typeof maybePreProcessedSourcePath === 'string' && maybePreProcessedSourcePath.length > 0
        ? maybePreProcessedSourcePath
        : relativeInputPath;
};

function extractYamlFrontMatter(file: string): [Meta, object] {
    const parsed = load(file);
    const frontmatter = parsed.meta || {};
    const content = omit(parsed, ['meta']);

    return [frontmatter, content];
}

export async function mangleFrontMatter(run: Run, path: RelativePath, ext: string) {
    const vars = await run.vars.load(path);
    const file = await run.read(join(run.input, path));

    const [frontmatter, content] =
        ext === '.yaml' ? extractYamlFrontMatter(file) : await extractFrontMatter(file, path);

    const {__system: systemVars, __metadata: metadataVars} = vars;

    const shouldAlwaysAddVCSPath =
        typeof run.config.vcs?.remoteBase === 'string' && run.config.vcs.remoteBase.length > 0;
    const vcsFrontMatter = run.vcs.enabled
        ? await resolveVCSFrontMatter(run, path, frontmatter, content)
        : undefined;

    const liquidedFrontMatter = cloneDeepWith(frontmatter, (value: unknown) =>
        typeof value === 'string'
            ? liquidSnippet(value, vars, path, {
                  substitutions: run.config.template.features.substitutions,
                  conditions: run.config.template.features.conditions,
                  keepNotVar: true,
                  withSourceMap: false,
              })
            : undefined,
    );

    run.meta.add(path, liquidedFrontMatter);
    run.meta.addMetadata(path, metadataVars);
    run.meta.addSystemVars(path, systemVars);
    run.meta.addResources(path, run.config.resources);
    run.meta.add(path, {
        vcsPath:
            frontmatter.vcsPath ??
            (shouldAlwaysAddVCSPath ? resolveVCSPath(frontmatter, path) : undefined),
        ...vcsFrontMatter,
    });

    return content;
}

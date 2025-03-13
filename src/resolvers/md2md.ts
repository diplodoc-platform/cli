import type {Run} from '~/commands/build';
import type {ResolverResult} from '~/steps';

import {extname, join} from 'node:path';
import {uniq} from 'lodash';
import {dump} from 'js-yaml';
import pmap from 'p-map';
import {normalizePath} from '~/core/utils';

export async function resolveToMd(run: Run, path: RelativePath): Promise<ResolverResult> {
    const file = normalizePath(path);
    const extension = extname(path);

    if (extension === '.yaml') {
        const content = await run.leading.load(file);
        const result = dump(await run.leading.dump(file, content));

        await run.write(join(run.output, file), result);
    } else if (extension === '.md') {
        const content = await run.markdown.load(file);
        const [result] = await run.markdown.dump(file, content);

        await run.write(join(run.output, file), result);

        const deps = uniq((await run.markdown.deps(file)).map(({path}) => path));

        await pmap(deps, async (path) => {
            const markdown = await run.markdown.load(path, [file]);
            const [result] = await run.markdown.dump(path, markdown);
            await run.write(join(run.output, path), result);
        });
    }

    run.logger.info('Processing finished:', path);

    return {};
}

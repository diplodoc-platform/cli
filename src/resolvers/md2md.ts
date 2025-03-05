import type {Run} from '~/commands/build';
import type {ResolverResult} from '~/steps';

import {extname, join} from 'node:path';
import {uniq} from 'lodash';
import {dump} from 'js-yaml';
import pmap from 'p-map';
import {PROCESSING_FINISHED} from '../constants';

export async function resolveToMd(run: Run, path: RelativePath): Promise<ResolverResult> {
    const extension = extname(path);

    if (extension === '.yaml') {
        const content = await run.leading.load(path);
        const result = dump(await run.leading.dump(path, content));

        await run.write(join(run.output, path), result);
    } else if (extension === '.md') {
        const content = await run.markdown.load(path);
        const result = await run.markdown.dump(path, content);

        await run.write(join(run.output, path), result);

        const deps = uniq((await run.markdown.deps(path)).map(({path}) => path));

        await pmap(deps, async (path) => {
            const markdown = await run.markdown.load(path);
            const result = await run.markdown.dump(path, markdown);
            await run.write(join(run.output, path), result);
        });
    }

    run.logger.info(PROCESSING_FINISHED, path);

    return {};
}

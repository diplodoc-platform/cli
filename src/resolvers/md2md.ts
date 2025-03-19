import type {Run} from '~/commands/build';
import type {ResolverResult} from '~/steps';

import {extname, join} from 'node:path';
import {dump} from 'js-yaml';
import {normalizePath} from '~/core/utils';

export async function resolveToMd(run: Run, path: RelativePath): Promise<ResolverResult> {
    const file = normalizePath(path);
    const extension = extname(path);

    if (extension === '.yaml') {
        const content = await run.leading.load(file);
        const result = await run.leading.dump(file, content);

        await run.write(join(run.output, file), dump(result));
    } else if (extension === '.md') {
        const content = await run.markdown.load(file);
        const [result] = await run.markdown.dump(file, content);

        await run.write(join(run.output, file), result);
    }

    run.logger.info('Processing finished:', path);

    return {};
}

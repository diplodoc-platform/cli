import type {Run} from '../../..';
import type {HashedGraphNode, StepFunction} from '../utils';

import {replaceAll} from '~/core/utils';

import {signlink} from '../utils';

function rehashInclude(include: HashedGraphNode) {
    return replaceAll(include.match, include.link, signlink(include.link, include.hash));
}

export function rehashIncludes(_run: Run, deps: HashedGraphNode[]): StepFunction {
    return async function (scheduler): Promise<void> {
        type StepContext = {dep: HashedGraphNode};

        const actor = async (content: string, {dep}: StepContext): Promise<string> => {
            const {location} = dep;

            const rehashed = rehashInclude(dep);

            return content.slice(0, location[0]) + rehashed + content.slice(location[1]);
        };

        for (const dep of deps) {
            scheduler.add(dep.location, actor, {dep});
        }
    } as StepFunction;
}

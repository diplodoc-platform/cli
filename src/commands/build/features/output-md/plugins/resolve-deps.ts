import type {HashedGraphNode, Sheduler, StepContext, StepFunction} from '../utils';

import {signlink} from '../utils';
import {replaceAll} from '~/core/utils';

import {Run} from '../../..';

function rehashInclude(include: HashedGraphNode) {
    return replaceAll(include.match, include.link, signlink(include.link, include.hash));
}

export function rehashIncludes(_run: Run, deps: HashedGraphNode[]): StepFunction {
    return async function (sheduler: Sheduler): Promise<void> {
        const actor = async (content: string, {dep}: StepContext): Promise<string> => {
            let result = content;
            const {location} = dep as HashedGraphNode;

            const rehashed = rehashInclude(dep as HashedGraphNode);
            result = result.slice(0, location[0]) + rehashed + result.slice(location[1]);

            return result;
        };

        for (const dep of deps) {
            sheduler.add(dep.location, actor, {dep});
        }
    };
}

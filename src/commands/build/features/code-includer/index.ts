import type {Build, Run} from '~/commands/build';

import {getHooks as getBaseHooks} from '~/core/program';
import {getHooks as getMarkdownHooks} from '~/core/markdown';

import {collect} from './collect';

export const NAME = 'CodeIncluder';

export class CodeIncluder {
    apply(program: Build) {
        getBaseHooks<Run>(program).BeforeAnyRun.tap(NAME, (run) => {
            getMarkdownHooks(run.markdown).Collects.tap(NAME, (collects) => {
                return collects.concat(collect);
            });
        });
    }
}

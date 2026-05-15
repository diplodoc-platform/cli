import type {Build, Run} from '~/commands/build';
import type {Meta} from '~/core/meta';

import {getHooks as getBaseHooks} from '~/core/program';
import {getHooks as getLeadingHooks} from '~/core/leading';
import {getHooks as getMarkdownHooks} from '~/core/markdown';

import {METRIKA_CSP_RULES} from './constants';

export const NAME = 'Analytics';

export class Analytics {
    apply(program: Build) {
        getBaseHooks<Run>(program).BeforeAnyRun.tap(NAME, async (run) => {
            getLeadingHooks(run.leading).Loaded.tap(NAME, this.addResources(run));
            getMarkdownHooks(run.markdown).Loaded.tap(NAME, this.addResources(run));
        });
    }

    private addResources(run: Run) {
        const hasMetrikaCounter = this.hasSomeMetrikaCounter(run);

        return (_content: unknown, _meta: Meta, path: NormalizedPath) => {
            if (hasMetrikaCounter) {
                run.meta.addResources(path, {csp: [METRIKA_CSP_RULES]});
            }
        };
    }

    private hasSomeMetrikaCounter(run: Run) {
        const rawMetrika = run.config.analytics?.metrika ?? [];

        if (!Array.isArray(rawMetrika)) {
            return false;
        }

        return rawMetrika.some((metrika) => {
            return (
                Boolean(metrika) && typeof metrika === 'object' && typeof metrika.id === 'number'
            );
        });
    }
}

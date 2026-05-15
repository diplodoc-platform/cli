import type {Build} from '~/commands/build';

import {getEntryHooks} from '~/commands/build';
import {getHooks as getBaseHooks} from '~/core/program';
import {getBuildHooks} from '~/commands';

import {getNeuroExpertCsp, getNeuroExpertScript, resolveByLang} from './utils';

export type NeuroExpertConfig = {
    neuroExpert: NeuroExpertBase;
};

export type NeuroExpertBase = {
    projectId?: {
        [key: string]: string;
    };
    hasOutsideClick?: boolean;
    parentId?: string | null;
    disabled?: boolean;
    customLabel?: {
        [key: string]: string;
    };
    type?: 'widget' | 'search';
};

const NEURO_EXPERT_PARENT_ID = 'neuro-expert-widget';

function extractMetrikaIds(analytics: Hash | undefined): number[] {
    const rawMetrika = analytics?.metrika;

    if (!Array.isArray(rawMetrika)) {
        return [];
    }

    return rawMetrika
        .filter(
            (entry) => Boolean(entry) && typeof entry === 'object' && typeof entry.id === 'number',
        )
        .map((entry) => entry.id as number);
}

export class NeuroExpert {
    apply(program: Build) {
        getBaseHooks(program).Config.tap('NeuroExpert', (config) => {
            const neuroExpert = config?.neuroExpert;
            const disabled = neuroExpert?.disabled || !neuroExpert?.projectId;

            config.neuroExpert = {
                projectId: neuroExpert?.projectId,
                hasOutsideClick: neuroExpert?.hasOutsideClick ?? true,
                parentId: neuroExpert?.parentId ?? NEURO_EXPERT_PARENT_ID,
                disabled,
                customLabel: neuroExpert?.customLabel,
                type: neuroExpert?.type ?? 'widget',
            };

            return config;
        });

        getBuildHooks(program)
            .BeforeRun.for('html')
            .tap('NeuroExpert', (run) => {
                getEntryHooks(run.entry).State.tap('NeuroExpert', (state) => {
                    const metaNeuroExpert = (state.data.meta as Hash)?.neuroExpert ?? {};
                    const neuroExpert = {
                        ...run.config.neuroExpert,
                        ...metaNeuroExpert,
                    };

                    if (neuroExpert.type !== 'search') {
                        return;
                    }

                    const projectId = resolveByLang(neuroExpert.projectId, state.lang);

                    if (!neuroExpert.disabled && projectId) {
                        state.neuroExpert = {projectId};
                    }
                });

                getEntryHooks(run.entry).Page.tap('NeuroExpert', (template) => {
                    const meta = run.meta.get(template.path);

                    const neuroExpert = {
                        ...run.config.neuroExpert,
                        ...(meta.neuroExpert ?? {}),
                    };

                    const projectId = resolveByLang(neuroExpert.projectId, template.lang);

                    if (!neuroExpert || neuroExpert.disabled || !projectId) {
                        return;
                    }

                    const customLabel = resolveByLang(neuroExpert.customLabel, template.lang);

                    const neuroExpertCsp = getNeuroExpertCsp();

                    neuroExpertCsp.map((csp) => template.addCsp(csp));

                    const metrikaIds = extractMetrikaIds(run.config.analytics);

                    const neuroExpertScript = getNeuroExpertScript(
                        projectId,
                        neuroExpert,
                        customLabel,
                        metrikaIds,
                    );

                    template.addScript(neuroExpertScript, {
                        position: 'state',
                        inline: true,
                    });
                });
            });
    }
}

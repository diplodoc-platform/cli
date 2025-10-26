import type {Build} from '~/commands/build';

import {getEntryHooks} from '~/commands/build';
import {getHooks as getBaseHooks} from '~/core/program';
import {getBuildHooks} from '~/commands';

import {getNeuroExpertCsp, getNeuroExpertScript} from './utils';

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
};

const NEURO_EXPERT_PARENT_ID = 'neuro-expert-widget';

export class NeuroExpert {
    apply(program: Build) {
        getBaseHooks(program).Config.tap('NeuroExpert', (config) => {
            const neuroExpert = config?.neuroExpert;
            const disabled = neuroExpert.disabled || !neuroExpert.projectId;

            config.neuroExpert = {
                projectId: neuroExpert.projectId,
                hasOutsideClick: neuroExpert.hasOutsideClick ?? true,
                parentId: neuroExpert.parentId ?? NEURO_EXPERT_PARENT_ID,
                disabled,
            };

            return config;
        });

        getBuildHooks(program)
            .BeforeRun.for('html')
            .tap('NeuroExpert', (run) => {
                getEntryHooks(run.entry).Page.tap('NeuroExpert', (template) => {
                    const meta = run.meta.get(template.path);

                    const neuroExpert = {
                        ...run.config.neuroExpert,
                        ...(meta.neuroExpert ?? {}),
                    };

                    const projectId =
                        neuroExpert.projectId?.[template.lang] ??
                        neuroExpert.projectId?.default ??
                        undefined;

                    if (!neuroExpert || neuroExpert.disabled || !projectId) {
                        return;
                    }

                    const neuroExpertCsp = getNeuroExpertCsp();

                    neuroExpertCsp.map((csp) => template.addCsp(csp));

                    const neuroExpertScript = getNeuroExpertScript(projectId, neuroExpert);

                    template.addScript(neuroExpertScript, {
                        position: 'state',
                        inline: true,
                    });
                });
            });
    }
}

import type {NeuroExpert, NeuroExpertSettings} from '../types';

import dedent from 'ts-dedent';

export function getNeuroExpertSettings(
    lang: string,
    neuroExpert: NeuroExpert,
): NeuroExpertSettings | undefined {
    const projectId =
        neuroExpert?.projectId?.[lang] ?? neuroExpert?.projectId?.default ?? undefined;

    if (!projectId || projectId === 'none') {
        return undefined;
    }

    const settings = {
        projectId,
        hasOutsideClick: neuroExpert.hasOutsideClick ?? true,
        isInternal: neuroExpert.isInternal ?? false,
        parentId: neuroExpert.parentId ?? null,
        zIndex: neuroExpert.zIndex ?? 1000,
    };

    return settings;
}

export function getNeuroExpertScript(lang: string, neuroExpert?: NeuroExpert): string | undefined {
    if (!neuroExpert || neuroExpert.isDisabled) {
        return undefined;
    }

    const neScriptUrl =
        'https://yastatic.net/s3/distribution/stardust/neuroexpert-widget/production/neuroexpert-widget.js';
    const settings = getNeuroExpertSettings(lang, neuroExpert);

    if (!settings) {
        return undefined;
    }

    return dedent`
        const neScript = document.createElement('script');
        neScript.type = "module";
        neScript.src = "${neScriptUrl}";

        console.log(${JSON.stringify(settings)})

        neScript.onload = () => {
            window.initNeuroexpert(${JSON.stringify(settings)});
        };

        document.body.appendChild(neScript);
    `;
}

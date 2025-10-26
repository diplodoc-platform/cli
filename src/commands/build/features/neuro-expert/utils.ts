import type {NeuroExpertBase} from '.';

import dedent from 'ts-dedent';

export function getNeuroExpertCsp(): Hash<string[]>[] {
    return [
        {
            'script-src': ['https://yastatic.net'],
        },
        {
            'connect-src': ['https://browserweb.s3.mdst.yandex.net'],
        },
        {
            'frame-src': ['https://expert.yandex.ru'],
        },
        {
            'font-src': ['https://yastatic.net'],
        },
    ];
}

export function getNeuroExpertScript(projectId: string, neuroExpert: NeuroExpertBase): string {
    const settings = {
        projectId,
        hasOutsideClick: neuroExpert.hasOutsideClick,
        parentId: neuroExpert.parentId,
    };

    const neuroExpertScriptUrl =
        'https://yastatic.net/s3/distribution/stardust/neuroexpert-widget/production/neuroexpert-widget.js';

    return dedent`
        const neuroExpertScript = document.createElement('script');
        neuroExpertScript.type = "module";
        neuroExpertScript.src = "${neuroExpertScriptUrl}";
        
        const neuroExpertDiv = document.createElement("div");
        neuroExpertDiv.id = "${settings.parentId}";
        neuroExpertDiv.className = "dc-neuro-expert-widget";

        neuroExpertScript.onload = () => {
            const widgetsDiv = document.getElementById("dc-widgets");
            
            widgetsDiv.appendChild(neuroExpertDiv);

            window.initNeuroexpert(${JSON.stringify(settings)});
        };

        document.body.appendChild(neuroExpertScript);
    `;
}

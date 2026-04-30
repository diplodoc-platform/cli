import type {NeuroExpertBase} from '.';

import dedent from 'ts-dedent';

export function getNeuroExpertCsp(): Hash<string[]>[] {
    return [
        {
            'script-src': ['https://yastatic.net'],
        },
        {
            'connect-src': ['https://browserweb.s3.mdst.yandex.net', 'https://expert.yandex.ru'],
        },
        {
            'frame-src': ['https://expert.yandex.ru'],
        },
        {
            'font-src': ['https://yastatic.net'],
        },
    ];
}

export function resolveByLang(
    map: Record<string, string> | undefined,
    lang: string,
): string | undefined {
    return map?.[lang] ?? map?.default ?? undefined;
}

export function getNeuroExpertScript(
    projectId: string,
    neuroExpert: NeuroExpertBase,
    customLabel?: string,
    metrikaIds?: number[],
): string {
    const settings = {
        projectId,
        hasOutsideClick: neuroExpert.hasOutsideClick,
        parentId: neuroExpert.parentId,
        customLabel,
    };

    const neuroExpertScriptUrl =
        'https://yastatic.net/s3/distribution/stardust/neuroexpert-widget/production/neuroexpert-widget.js';

    const initType = neuroExpert.type ?? 'widget';

    if (neuroExpert.type === 'search') {
        const iframeUrl = `https://expert.yandex.ru/expert/projects/${projectId}/iframe`;

        return dedent`
            const neuroExpertScript = document.createElement('script');
            neuroExpertScript.type = "module";
            neuroExpertScript.src = "${neuroExpertScriptUrl}";

            const neuroExpertPreload = document.createElement("iframe");
            neuroExpertPreload.src = "${iframeUrl}";
            neuroExpertPreload.loading = "eager";
            neuroExpertPreload.style.display = "none";
            neuroExpertPreload.setAttribute("aria-hidden", "true");
            document.body.appendChild(neuroExpertPreload);

            document.body.appendChild(neuroExpertScript);
        `;
    }

    const metricsScript = getNeuroExpertMetricsScript(initType, metrikaIds);

    return dedent`
        const neuroExpertScript = document.createElement('script');
        neuroExpertScript.type = "module";
        neuroExpertScript.src = "${neuroExpertScriptUrl}";

        const neuroExpertDiv = document.createElement("div");
        neuroExpertDiv.id = "${settings.parentId}";
        neuroExpertDiv.className = "dc-neuro-expert-widget";

        neuroExpertScript.onload = () => {
            function tryAppend() {
                const widgetsDiv = document.getElementById("dc-widgets");

                if (widgetsDiv) {
                    widgetsDiv.appendChild(neuroExpertDiv);
                    window.initNeuroexpert(${JSON.stringify(settings)});
                } else {
                    setTimeout(tryAppend, 50);
                }
            }

            tryAppend();
        };

        document.body.appendChild(neuroExpertScript);

        ${metricsScript}
    `;
}

function getNeuroExpertMetricsScript(initType: string, metrikaIds?: number[]): string {
    const idsJson = JSON.stringify(metrikaIds ?? []);

    return dedent`
        (function() {
            var neuroExpertMetrikaIds = ${idsJson};
            var neuroExpertInitType = "${initType}";
            var iframeActionMap = {
                "message-sent": "message"
            };

            function sendNeuroExpertGoal(action) {
                if (typeof ym === "undefined" || !neuroExpertMetrikaIds.length) {
                    return;
                }

                var params = {
                    action: action,
                    initType: neuroExpertInitType
                };

                for (var i = 0; i < neuroExpertMetrikaIds.length; i++) {
                    ym(neuroExpertMetrikaIds[i], "reachGoal", "DOCS_NEUROEXPERT_ACTION", params);
                }
            }

            neuroExpertDiv.addEventListener("click", function(e) {
                if (e.target.closest(".toggle-button")) {
                    requestAnimationFrame(function() {
                        var widgetPanel = neuroExpertDiv.querySelector(".widget");
                        if (widgetPanel && widgetPanel.classList.contains("visible")) {
                            sendNeuroExpertGoal("open");
                        }
                    });
                }
            });

            window.addEventListener("message", function(event) {
                if (event.origin !== "https://expert.yandex.ru") {
                    return;
                }

                var action = iframeActionMap[event.data && event.data.type];

                if (action) {
                    sendNeuroExpertGoal(action);
                }
            });
        })();
    `;
}

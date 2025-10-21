import {DEFAULT_CSP_SETTINGS} from '~/constants';

function unique(arr: string[]) {
    return Array.from(new Set(arr));
}

export function mergeCsp(csp: Hash<string[]>[]): Hash<string[]>[] {
    const merged: Hash<string[]> = {};

    for (const hash of csp) {
        for (const key in hash) {
            if (Object.prototype.hasOwnProperty.call(hash, key)) {
                if (!merged[key]) merged[key] = [];
                merged[key].push(...hash[key]);
            }
        }
    }

    for (const key in merged) {
        if (Object.prototype.hasOwnProperty.call(merged, key)) {
            merged[key] = unique(merged[key]);
        }
    }

    const result: Hash<string[]> = {...merged};

    for (const key in DEFAULT_CSP_SETTINGS) {
        if (Object.prototype.hasOwnProperty.call(DEFAULT_CSP_SETTINGS, key)) {
            if (result[key]) {
                const withDefaults = unique([
                    ...result[key].filter((v) => v !== "'none'"),
                    ...DEFAULT_CSP_SETTINGS[key].filter((v) => v !== "'none'"),
                ]);

                if (withDefaults.length === 0) {
                    result[key] = ["'none'"];
                } else {
                    result[key] = withDefaults;
                }
            } else {
                result[key] = [...DEFAULT_CSP_SETTINGS[key]];
            }
        }
    }

    return Object.keys(result).map((key) => ({[key]: result[key]}));
}

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

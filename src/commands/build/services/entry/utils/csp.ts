import {DEFAULT_CSP_SETTINGS} from '~/constants';

function unique(arr: string[]) {
    return Array.from(new Set(arr)).sort();
}

export function mergeCsp(csp: Hash<string[]>[]): Hash<string[]>[] {
    const merged: Hash<string[]> = {};

    for (const hash of csp) {
        for (const key in hash) {
            if (Object.prototype.hasOwnProperty.call(hash, key)) {
                const currentValues = merged[key] || [];
                const defaultValues = DEFAULT_CSP_SETTINGS[key] || [];

                const combined = [
                    ...currentValues.filter((v) => v !== "'none'"),
                    ...hash[key].filter((v) => v !== "'none'"),
                    ...defaultValues.filter((v) => v !== "'none'"),
                ];

                merged[key] = combined.length > 0 ? unique(combined) : ["'none'"];
            }
        }
    }

    for (const key in DEFAULT_CSP_SETTINGS) {
        if (Object.prototype.hasOwnProperty.call(DEFAULT_CSP_SETTINGS, key)) {
            if (!merged[key]) {
                merged[key] = [...DEFAULT_CSP_SETTINGS[key]];
            }
        }
    }

    return Object.keys(merged).map((key) => ({[key]: merged[key]}));
}

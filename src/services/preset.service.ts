import {resolve} from 'path';
import {readFileSync} from 'fs';
import {safeLoad} from 'js-yaml';

class PresetService {
    private readonly storage: Map<string, string>;

    constructor() {
        this.storage = new Map();
    }

    parseFile(path: string, audience: string) {
        const content = readFileSync(resolve(path), 'utf8');
        const parsedPreset = safeLoad(content);

        const combinedValues: Record<string, string> = {
            ...parsedPreset.default || {},
            ...parsedPreset[audience] || {}
        };

        Object.keys(combinedValues).forEach((key: string) => {
            const value: string = combinedValues[key];
            this.storage.set(key, value);
        });
    }

    get(key: string): string|undefined {
        return this.storage.get(key);
    }

    getAll() {
        return Object.fromEntries(this.storage);
    }
}

export default new PresetService();

import {describe, expect, it} from 'vitest';

import {resolveLlmsConfig} from './llms';

const defaults = {
    enabled: true,
    llmsFullMaxSize: 1024,
    description: 'Project summary',
    details: 'Project details',
    url: 'https://example.com/llms.txt',
};

describe('resolveLlmsConfig', () => {
    it('falls back independently and leaves project settings unchanged', () => {
        expect(resolveLlmsConfig(defaults, {llms: {description: 'English summary'}})).toEqual({
            ...defaults,
            description: 'English summary',
        });
        expect(resolveLlmsConfig(defaults, {llms: {details: 'Russian details'}})).toEqual({
            ...defaults,
            details: 'Russian details',
        });
        expect(resolveLlmsConfig(defaults, {})).toEqual(defaults);
    });

    it('uses empty strings to clear individual defaults', () => {
        expect(
            resolveLlmsConfig(defaults, {llms: {description: '', details: '', url: ''}}),
        ).toEqual({
            ...defaults,
            description: '',
            details: '',
            url: '',
        });
    });

    it('keeps multiple TOCs isolated and never mutates project or TOC settings', () => {
        const config = Object.freeze({...defaults, enabled: false});
        const english = Object.freeze({llms: Object.freeze({url: 'https://example.com/en.txt'})});
        const russian = Object.freeze({llms: Object.freeze({description: 'Russian summary'})});

        expect(resolveLlmsConfig(config, english)).toEqual({
            ...config,
            url: 'https://example.com/en.txt',
        });
        expect(resolveLlmsConfig(config, russian)).toEqual({
            ...config,
            description: 'Russian summary',
        });
        expect(config).toEqual({...defaults, enabled: false});
    });
});

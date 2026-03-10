import {describe, expect, it} from 'vitest';

import {indexMd, presetsYaml, tocYaml, yfmConfig} from './templates';

describe('yfmConfig', () => {
    it('single-lang: contains lang, no langs block', () => {
        const result = yfmConfig(['ru'], 'ru');
        expect(result).toContain('lang: ru');
        expect(result).not.toContain('langs:');
    });

    it('single-lang: includes project config comment', () => {
        expect(yfmConfig(['ru'], 'ru')).toContain('# YFM project config');
    });

    it('multi-lang: contains lang and inline langs array', () => {
        const result = yfmConfig(['ru', 'en'], 'ru');
        expect(result).toContain('lang: ru');
        expect(result).toContain("langs: ['ru', 'en']");
    });

    it('multi-lang: default-lang is reflected in lang field', () => {
        const result = yfmConfig(['ru', 'en'], 'en');
        expect(result).toMatch(/^lang: en/m);
    });

    it('multi-lang: all langs are present in array', () => {
        const result = yfmConfig(['ru', 'en', 'ar'], 'ru');
        expect(result).toContain("langs: ['ru', 'en', 'ar']");
    });
});

describe('tocYaml', () => {
    it('contains project name as title', () => {
        expect(tocYaml('My Docs')).toContain('title: My Docs');
    });

    it('contains href and Overview item', () => {
        const result = tocYaml('My Docs');
        expect(result).toContain('href: index.md');
        expect(result).toContain('name: Overview');
    });

    it('with header (default): contains navigation block with controls', () => {
        const result = tocYaml('My Docs');
        expect(result).toContain('navigation:');
        expect(result).toContain('type: controls');
    });

    it('with header true: contains navigation block', () => {
        const result = tocYaml('My Docs', true);
        expect(result).toContain('navigation:');
        expect(result).toContain('rightItems:');
    });

    it('with header false: no navigation block', () => {
        const result = tocYaml('My Docs', false);
        expect(result).not.toContain('navigation:');
        expect(result).not.toContain('rightItems:');
    });
});

describe('indexMd', () => {
    it('contains Welcome heading', () => {
        expect(indexMd()).toContain('# Welcome');
    });

    it('contains diplodoc link', () => {
        expect(indexMd()).toContain('diplodoc.com');
    });
});

describe('presetsYaml', () => {
    it('contains project name under default key', () => {
        const result = presetsYaml('My Project');
        expect(result).toContain('default:');
        expect(result).toContain('My Project');
    });
});

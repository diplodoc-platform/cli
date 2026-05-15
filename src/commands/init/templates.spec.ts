import {describe, expect, it} from 'vitest';

import {indexMd, pcYaml, presetsYaml, tocYaml, yfmConfig} from './templates';

describe('yfmConfig', () => {
    describe('minimal template', () => {
        it('single-lang: contains lang, no langs block', () => {
            const result = yfmConfig(['ru'], 'ru', 'minimal');
            expect(result).toContain('lang: ru');
            expect(result).not.toContain('langs:');
        });

        it('single-lang: no extended config', () => {
            const result = yfmConfig(['ru'], 'ru', 'minimal');
            expect(result).not.toContain('pdf:');
            expect(result).not.toContain('search:');
            expect(result).not.toContain('vcs:');
        });

        it('multi-lang: contains lang and inline langs array', () => {
            const result = yfmConfig(['ru', 'en'], 'ru', 'minimal');
            expect(result).toContain('lang: ru');
            expect(result).toContain("langs: ['ru', 'en']");
        });

        it('multi-lang: default-lang is reflected in lang field', () => {
            const result = yfmConfig(['ru', 'en'], 'en', 'minimal');
            expect(result).toMatch(/^lang: en/m);
        });

        it('multi-lang: all langs are present in array', () => {
            const result = yfmConfig(['ru', 'en', 'ar'], 'ru', 'minimal');
            expect(result).toContain("langs: ['ru', 'en', 'ar']");
        });

        it('multi-lang: contains allowHtml', () => {
            const result = yfmConfig(['ru', 'en'], 'ru', 'minimal');
            expect(result).toContain('allowHtml: true');
        });
    });

    describe('full template', () => {
        it('single-lang: contains extended config fields', () => {
            const result = yfmConfig(['ru'], 'ru', 'full');
            expect(result).toContain('pdf:');
            expect(result).toContain('enabled: true');
            expect(result).toContain('vcs: true');
            expect(result).toContain('mtimes: true');
            expect(result).toContain('authors: true');
            expect(result).toContain('breaks: true');
            expect(result).toContain('linkify: true');
        });

        it('single-lang: contains search config', () => {
            const result = yfmConfig(['ru'], 'ru', 'full');
            expect(result).toContain('search:');
            expect(result).toContain('provider: local');
            expect(result).toContain('tolerance: 2');
            expect(result).toContain('confidense: phrased');
        });

        it('single-lang: contains interface config', () => {
            const result = yfmConfig(['ru'], 'ru', 'full');
            expect(result).toContain('interface:');
            expect(result).toContain('toc-header: false');
        });

        it('multi-lang: contains extended config fields', () => {
            const result = yfmConfig(['ru', 'en'], 'ru', 'full');
            expect(result).toContain('pdf:');
            expect(result).toContain('search:');
            expect(result).toContain('vcs: true');
        });

        it('multi-lang: still contains lang and langs', () => {
            const result = yfmConfig(['ru', 'en'], 'en', 'full');
            expect(result).toMatch(/^lang: en/m);
            expect(result).toContain("langs: ['ru', 'en']");
        });
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

    it('special characters in name are preserved', () => {
        expect(tocYaml('My & Docs <test>')).toContain('title: My & Docs <test>');
    });
});

describe('indexMd', () => {
    it('contains Welcome heading', () => {
        expect(indexMd()).toContain('# Welcome');
    });

    it('contains diplodoc link', () => {
        expect(indexMd()).toContain('diplodoc.com');
    });

    it('contains toc.yaml reference', () => {
        expect(indexMd()).toContain('toc.yaml');
    });
});

describe('presetsYaml', () => {
    it('contains project name under default key', () => {
        const result = presetsYaml('My Project');
        expect(result).toContain('default:');
        expect(result).toContain('My Project');
    });

    it('is valid yaml structure with project-name key', () => {
        const result = presetsYaml('My Project');
        expect(result).toContain('project-name: My Project');
    });
});

describe('pcYaml', () => {
    it('contains basic-card block type', () => {
        expect(pcYaml()).toContain('type: basic-card');
    });

    it('contains required block fields', () => {
        const result = pcYaml();
        expect(result).toContain('blocks:');
        expect(result).toContain('title:');
        expect(result).toContain('description:');
    });
});

import type {NeuroExpertConfig} from './index';

import {describe, expect, it, vi} from 'vitest';

import {getNeuroExpertCsp, getNeuroExpertScript} from './utils';

vi.mock('~/commands/build', () => ({
    getEntryHooks: vi.fn(),
    getBuildHooks: vi.fn(),
}));

vi.mock('~/core/program', () => ({
    getHooks: vi.fn(),
}));

vi.mock('~/commands', () => ({
    getBuildHooks: vi.fn(),
}));

const NEURO_EXPERT_PARENT_ID = 'neuro-expert-widget';

function createNeuroExpertConfig(overrides: Partial<NeuroExpertConfig['neuroExpert']> = {}) {
    return {
        neuroExpert: {
            projectId: {
                ru: 'ru-project-id',
                en: 'en-project-id',
                default: 'default-project-id',
            },
            hasOutsideClick: true,
            parentId: NEURO_EXPERT_PARENT_ID,
            disabled: false,
            ...overrides,
        },
    };
}

describe('NeuroExpert utils', () => {
    describe('getNeuroExpertCsp', () => {
        it('should return correct CSP rules', () => {
            const csp = getNeuroExpertCsp();

            expect(csp).toHaveLength(4);
            expect(csp).toEqual([
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
            ]);
        });

        it('should include script-src for yastatic.net', () => {
            const csp = getNeuroExpertCsp();
            const scriptSrc = csp.find((rule) => rule['script-src']);

            expect(scriptSrc).toBeDefined();
            expect(scriptSrc?.['script-src']).toContain('https://yastatic.net');
        });

        it('should include connect-src for s3.mdst.yandex.net', () => {
            const csp = getNeuroExpertCsp();
            const connectSrc = csp.find((rule) => rule['connect-src']);

            expect(connectSrc).toBeDefined();
            expect(connectSrc?.['connect-src']).toContain('https://browserweb.s3.mdst.yandex.net');
        });

        it('should include frame-src for expert.yandex.ru', () => {
            const csp = getNeuroExpertCsp();
            const frameSrc = csp.find((rule) => rule['frame-src']);

            expect(frameSrc).toBeDefined();
            expect(frameSrc?.['frame-src']).toContain('https://expert.yandex.ru');
        });

        it('should include font-src for yastatic.net', () => {
            const csp = getNeuroExpertCsp();
            const fontSrc = csp.find((rule) => rule['font-src']);

            expect(fontSrc).toBeDefined();
            expect(fontSrc?.['font-src']).toContain('https://yastatic.net');
        });
    });

    describe('getNeuroExpertScript', () => {
        it('should generate script with correct projectId', () => {
            const projectId = 'test-project-id';
            const config = createNeuroExpertConfig({projectId: {default: projectId}});

            const script = getNeuroExpertScript(projectId, config.neuroExpert);

            expect(script).toContain('test-project-id');
            expect(script).toContain(
                'https://yastatic.net/s3/distribution/stardust/neuroexpert-widget/production/neuroexpert-widget.js',
            );
        });

        it('should include correct settings in script', () => {
            const projectId = 'test-project-id';
            const config = createNeuroExpertConfig({
                projectId: {default: projectId},
                hasOutsideClick: false,
                parentId: 'custom-parent-id',
            });

            const script = getNeuroExpertScript(projectId, config.neuroExpert);

            expect(script).toContain('"projectId":"test-project-id"');
            expect(script).toContain('"hasOutsideClick":false');
            expect(script).toContain('"parentId":"custom-parent-id"');
        });

        it('should create div element with correct id', () => {
            const projectId = 'test-project-id';
            const config = createNeuroExpertConfig({projectId: {default: projectId}});

            const script = getNeuroExpertScript(projectId, config.neuroExpert);

            expect(script).toContain(`neuroExpertDiv.id = "${NEURO_EXPERT_PARENT_ID}"`);
        });

        it('should create div element with correct className', () => {
            const projectId = 'test-project-id';
            const config = createNeuroExpertConfig({projectId: {default: projectId}});

            const script = getNeuroExpertScript(projectId, config.neuroExpert);

            expect(script).toContain('neuroExpertDiv.className = "dc-neuro-expert-widget"');
        });

        it('should call initNeuroexpert with settings', () => {
            const projectId = 'test-project-id';
            const config = createNeuroExpertConfig({projectId: {default: projectId}});

            const script = getNeuroExpertScript(projectId, config.neuroExpert);

            expect(script).toContain('window.initNeuroexpert(');
            expect(script).toMatch(
                /window\.initNeuroexpert\({.*"projectId":"test-project-id".*}\)/,
            );
        });

        it('should use custom parentId when provided', () => {
            const projectId = 'test-project-id';
            const customParentId = 'my-custom-widget';
            const config = createNeuroExpertConfig({
                projectId: {default: projectId},
                parentId: customParentId,
            });

            const script = getNeuroExpertScript(projectId, config.neuroExpert);

            expect(script).toContain(`neuroExpertDiv.id = "${customParentId}"`);
            expect(script).toContain(`"parentId":"${customParentId}"`);
        });
    });

    describe('NeuroExpert config', () => {
        it('should handle disabled: false', () => {
            const config = createNeuroExpertConfig({disabled: false});

            expect(config.neuroExpert.disabled).toBe(false);
        });

        it('should handle disabled: true', () => {
            const config = createNeuroExpertConfig({disabled: true});

            expect(config.neuroExpert.disabled).toBe(true);
        });

        it('should handle locale configuration', () => {
            const config = createNeuroExpertConfig({
                projectId: {
                    ru: 'ru-project-id',
                    en: 'en-project-id',
                    default: 'default-project-id',
                },
            });

            expect(config.neuroExpert.projectId?.ru).toBe('ru-project-id');
            expect(config.neuroExpert.projectId?.en).toBe('en-project-id');
            expect(config.neuroExpert.projectId?.default).toBe('default-project-id');
        });

        it('should handle missing specific locale', () => {
            const config = createNeuroExpertConfig({
                projectId: {
                    default: 'default-project-id',
                },
            });

            expect(config.neuroExpert.projectId?.ru).toBeUndefined();
            expect(config.neuroExpert.projectId?.en).toBeUndefined();
            expect(config.neuroExpert.projectId?.default).toBe('default-project-id');
        });

        it('should handle missing default locale', () => {
            const config = createNeuroExpertConfig({
                projectId: {
                    ru: 'ru-project-id',
                    en: 'en-project-id',
                },
            });

            expect(config.neuroExpert.projectId?.default).toBeUndefined();
        });

        it('should handle missing projectId entirely', () => {
            const config = createNeuroExpertConfig({
                projectId: undefined,
            });

            expect(config.neuroExpert.projectId).toBeUndefined();
        });

        it('should be disabled when projectId is missing', () => {
            const config = createNeuroExpertConfig({
                projectId: undefined,
            });

            const shouldBeDisabled = config.neuroExpert.disabled || !config.neuroExpert.projectId;

            expect(shouldBeDisabled).toBe(true);
        });

        it('should handle empty projectId object', () => {
            const config = createNeuroExpertConfig({
                projectId: {},
            });

            expect(config.neuroExpert.projectId).toEqual({});
        });

        it('should use default hasOutsideClick value', () => {
            const config = createNeuroExpertConfig();

            expect(config.neuroExpert.hasOutsideClick).toBe(true);
        });

        it('should allow overriding hasOutsideClick', () => {
            const config = createNeuroExpertConfig({hasOutsideClick: false});

            expect(config.neuroExpert.hasOutsideClick).toBe(false);
        });

        it('should use default parentId value', () => {
            const config = createNeuroExpertConfig();

            expect(config.neuroExpert.parentId).toBe(NEURO_EXPERT_PARENT_ID);
        });

        it('should allow overriding parentId', () => {
            const customParentId = 'custom-widget-id';
            const config = createNeuroExpertConfig({parentId: customParentId});

            expect(config.neuroExpert.parentId).toBe(customParentId);
        });
    });

    describe('Locale Selection Logic', () => {
        it('should select correct locale from projectId', () => {
            const config = createNeuroExpertConfig({
                projectId: {
                    ru: 'ru-id',
                    en: 'en-id',
                    default: 'default-id',
                },
            });

            const ruProjectId =
                config.neuroExpert.projectId?.ru ??
                config.neuroExpert.projectId?.default ??
                undefined;

            expect(ruProjectId).toBe('ru-id');
        });

        it('should fall back to default locale when specific locale is missing', () => {
            const config = createNeuroExpertConfig({
                projectId: {
                    ru: 'ru-id',
                    default: 'default-id',
                },
            });

            const enProjectId =
                config.neuroExpert.projectId?.en ??
                config.neuroExpert.projectId?.default ??
                undefined;

            expect(enProjectId).toBe('default-id');
        });

        it('should return undefined when both specific and default locale are missing', () => {
            const config = createNeuroExpertConfig({
                projectId: {
                    ru: 'ru-id',
                },
            });

            const enProjectId =
                config.neuroExpert.projectId?.en ??
                config.neuroExpert.projectId?.default ??
                undefined;

            expect(enProjectId).toBeUndefined();
        });

        it('should return undefined when projectId is empty object', () => {
            const config = createNeuroExpertConfig({
                projectId: {},
            });

            const ruProjectId =
                config.neuroExpert.projectId?.ru ??
                config.neuroExpert.projectId?.default ??
                undefined;

            expect(ruProjectId).toBeUndefined();
        });
    });
});

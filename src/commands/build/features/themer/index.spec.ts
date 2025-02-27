import {describe, it, vi, expect, beforeEach, afterEach} from 'vitest';
import {runBuild, setupBuild, testConfig as test} from '../../__tests__';
import dedent from 'ts-dedent';
import {resolve} from 'node:path';
import * as utils from './utils';
import {THEME_CSS_PATH} from '~/constants';
import {DEFAULT_BRAND_DEPEND_COLORS} from './constants';

describe('Build themer feature', () => {
    describe('config', () => {
        afterEach(() => {
            vi.restoreAllMocks();
        });
        
        test('should handle default', '', {
            theme: false,
        });

        test('should handle arg', "--theme 'note-info-background: rgb(40, 216, 105)'", {
            theme: 'note-info-background: rgb(40, 216, 105)',
        });
    });

    describe('run', () => {
        const args = (...args: string[]) =>
            '-i /dev/null/input -o /dev/null/output ' + args.join(' ');

        describe('no theme', () => {
            it('should not create theme for html build', async () => {
                const build = setupBuild();

                await runBuild(args(), build);

                expect(build.run.write).not.toHaveBeenCalled();
            });

            it('should not create theme for md build', async () => {
                const build = setupBuild();

                await runBuild(args('-f', 'md'), build);

                expect(build.run.write).not.toHaveBeenCalled();
            });
        });

        describe('from file', () => {
            beforeEach(() => {
                vi.spyOn(utils, 'isThemeFileExists').mockReturnValue(true);
            });

            afterEach(() => {
                vi.restoreAllMocks();
            });

            it('should create theme for html', async () => {
                const build = setupBuild({
                    files: {
                        'theme.yaml': dedent`
                        base-misc-light: blue
                    `,
                    },
                });

                await runBuild(args(), build);

                expect(build.run.write).toHaveBeenCalledWith(
                    resolve(build.run.originalOutput, THEME_CSS_PATH),
                    `.g-root {\n    --g-color-base-misc-light: blue;\n}`,
                );
            });

            it('should create theme for md ', async () => {
                const build = setupBuild({
                    files: {
                        'theme.yaml': dedent`
                        base-misc-light: blue
                    `,
                    },
                });

                await runBuild(args('-f', 'md'), build);

                expect(build.run.write).toHaveBeenCalledWith(
                    resolve(build.run.originalOutput, THEME_CSS_PATH),
                    dedent`
                .g-root {
                    --g-color-base-misc-light: blue;
                }`,
                );
            });

            it('should create theme with base-brand', async () => {
                const build = setupBuild({
                    files: {
                        'theme.yaml': dedent`
                        base-brand: rgb(78, 231, 228)
                        light:
                    `,
                    },
                });

                await runBuild(args(), build);

                const expectedString = dedent`
            .g-root {
                --g-color-base-brand: rgb(78, 231, 228);
            }

            .g-root_theme_light {
                --g-color-private-brand-50: rgb(78 231 228 / 0.1);
                --g-color-private-brand-100: rgb(78 231 228 / 0.15);
                --g-color-private-brand-150: rgb(78 231 228 / 0.2);
                --g-color-private-brand-200: rgb(78 231 228 / 0.3);
                --g-color-private-brand-250: rgb(78 231 228 / 0.4);
                --g-color-private-brand-300: rgb(78 231 228 / 0.5);
                --g-color-private-brand-350: rgb(78 231 228 / 0.6);
                --g-color-private-brand-400: rgb(78 231 228 / 0.7);
                --g-color-private-brand-450: rgb(78 231 228 / 0.8);
                --g-color-private-brand-500: rgb(78 231 228 / 0.9);
                --g-color-private-brand-550-solid: rgb(78 231 228);
                --g-color-private-brand-1000-solid: rgb(50 72 78);
                --g-color-private-brand-950-solid: rgb(52 81 86);
                --g-color-private-brand-900-solid: rgb(55 100 104);
                --g-color-private-brand-850-solid: rgb(58 119 122);
                --g-color-private-brand-800-solid: rgb(62 138 140);
                --g-color-private-brand-750-solid: rgb(65 156 157);
                --g-color-private-brand-700-solid: rgb(68 175 175);
                --g-color-private-brand-650-solid: rgb(71 194 193);
                --g-color-private-brand-600-solid: rgb(75 212 210);
                --g-color-private-brand-500-solid: rgb(75 212 210);
                --g-color-private-brand-450-solid: rgb(71 194 193);
                --g-color-private-brand-400-solid: rgb(68 175 175);
                --g-color-private-brand-350-solid: rgb(65 156 157);
                --g-color-private-brand-300-solid: rgb(62 138 140);
                --g-color-private-brand-250-solid: rgb(58 119 122);
                --g-color-private-brand-200-solid: rgb(55 100 104);
                --g-color-private-brand-150-solid: rgb(52 81 86);
                --g-color-private-brand-100-solid: rgb(50 72 78);
                --g-color-private-brand-50-solid: rgb(48 63 69);
                --g-color-base-brand: rgb(78, 231, 228);
                --g-color-base-background: ${DEFAULT_BRAND_DEPEND_COLORS.light['base-background']};
                --g-color-base-brand-hover: ${DEFAULT_BRAND_DEPEND_COLORS.light['base-brand-hover']};
                --g-color-base-selection: ${DEFAULT_BRAND_DEPEND_COLORS.light['base-selection']};
                --g-color-base-selection-hover: ${DEFAULT_BRAND_DEPEND_COLORS.light['base-selection-hover']};
                --g-color-text-link: ${DEFAULT_BRAND_DEPEND_COLORS.light['text-link']};
                --g-color-text-link-hover: ${DEFAULT_BRAND_DEPEND_COLORS.light['text-link-hover']};
                --g-color-text-brand: ${DEFAULT_BRAND_DEPEND_COLORS.light['text-brand']};
                --g-color-text-brand-heavy: ${DEFAULT_BRAND_DEPEND_COLORS.light['text-brand-heavy']};
                --g-color-line-brand: ${DEFAULT_BRAND_DEPEND_COLORS.light['line-brand']};
            }

            .g-root_theme_dark {
                --g-color-private-brand-50: rgb(78 231 228 / 0.1);
                --g-color-private-brand-100: rgb(78 231 228 / 0.15);
                --g-color-private-brand-150: rgb(78 231 228 / 0.2);
                --g-color-private-brand-200: rgb(78 231 228 / 0.3);
                --g-color-private-brand-250: rgb(78 231 228 / 0.4);
                --g-color-private-brand-300: rgb(78 231 228 / 0.5);
                --g-color-private-brand-350: rgb(78 231 228 / 0.6);
                --g-color-private-brand-400: rgb(78 231 228 / 0.7);
                --g-color-private-brand-450: rgb(78 231 228 / 0.8);
                --g-color-private-brand-500: rgb(78 231 228 / 0.9);
                --g-color-private-brand-550-solid: rgb(78 231 228);
                --g-color-private-brand-1000-solid: rgb(228 251 251);
                --g-color-private-brand-950-solid: rgb(220 250 250);
                --g-color-private-brand-900-solid: rgb(202 248 247);
                --g-color-private-brand-850-solid: rgb(184 245 244);
                --g-color-private-brand-800-solid: rgb(167 243 242);
                --g-color-private-brand-750-solid: rgb(149 241 239);
                --g-color-private-brand-700-solid: rgb(131 238 236);
                --g-color-private-brand-650-solid: rgb(113 236 233);
                --g-color-private-brand-600-solid: rgb(96 233 231);
                --g-color-private-brand-500-solid: rgb(96 233 231);
                --g-color-private-brand-450-solid: rgb(113 236 233);
                --g-color-private-brand-400-solid: rgb(131 238 236);
                --g-color-private-brand-350-solid: rgb(149 241 239);
                --g-color-private-brand-300-solid: rgb(167 243 242);
                --g-color-private-brand-250-solid: rgb(184 245 244);
                --g-color-private-brand-200-solid: rgb(202 248 247);
                --g-color-private-brand-150-solid: rgb(220 250 250);
                --g-color-private-brand-100-solid: rgb(228 251 251);
                --g-color-private-brand-50-solid: rgb(237 253 252);
                --g-color-base-brand: rgb(78, 231, 228);
                --g-color-base-background: ${DEFAULT_BRAND_DEPEND_COLORS.dark['base-background']};
                --g-color-base-brand-hover: ${DEFAULT_BRAND_DEPEND_COLORS.dark['base-brand-hover']};
                --g-color-base-selection: ${DEFAULT_BRAND_DEPEND_COLORS.dark['base-selection']};
                --g-color-base-selection-hover: ${DEFAULT_BRAND_DEPEND_COLORS.dark['base-selection-hover']};
                --g-color-text-link: ${DEFAULT_BRAND_DEPEND_COLORS.dark['text-link']};
                --g-color-text-link-hover: ${DEFAULT_BRAND_DEPEND_COLORS.dark['text-link-hover']};
                --g-color-text-brand: ${DEFAULT_BRAND_DEPEND_COLORS.dark['text-brand']};
                --g-color-text-brand-heavy: ${DEFAULT_BRAND_DEPEND_COLORS.dark['text-brand-heavy']};
                --g-color-line-brand: ${DEFAULT_BRAND_DEPEND_COLORS.dark['line-brand']};
            }`;

                expect(build.run.write).toHaveBeenCalledWith(
                    resolve(build.run.originalOutput, THEME_CSS_PATH),
                    expectedString,
                );
            });
        });

        describe('from arg', () => {
            it('should create theme from --theme arg', async () => {
                const build = setupBuild();

                await runBuild(args('--theme', "'note-info-background: rgb(40, 216, 105)'"), build);

                expect(build.run.write).toHaveBeenCalledWith(
                    resolve(build.run.originalOutput, THEME_CSS_PATH),
                    dedent`
                .yfm {
                    --yfm-color-note-info-background: rgb(40, 216, 105);
                }`,
                );
            });
        });
    });
});

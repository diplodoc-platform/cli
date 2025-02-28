import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
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

        test('should handle arg', '--theme blue', {
            theme: 'blue',
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

                await runBuild(args('--theme', 'blue'), build);

                const expectedString = dedent`
                .g-root {
                    --g-color-base-brand: blue;
                }

                .g-root_theme_light {
                    --g-color-private-brand-50: rgb(0 0 255 / 0.1);
                    --g-color-private-brand-100: rgb(0 0 255 / 0.15);
                    --g-color-private-brand-150: rgb(0 0 255 / 0.2);
                    --g-color-private-brand-200: rgb(0 0 255 / 0.3);
                    --g-color-private-brand-250: rgb(0 0 255 / 0.4);
                    --g-color-private-brand-300: rgb(0 0 255 / 0.5);
                    --g-color-private-brand-350: rgb(0 0 255 / 0.6);
                    --g-color-private-brand-400: rgb(0 0 255 / 0.7);
                    --g-color-private-brand-450: rgb(0 0 255 / 0.8);
                    --g-color-private-brand-500: rgb(0 0 255 / 0.9);
                    --g-color-private-brand-550-solid: rgb(0 0 255);
                    --g-color-private-brand-1000-solid: rgb(38 37 82);
                    --g-color-private-brand-950-solid: rgb(36 35 92);
                    --g-color-private-brand-900-solid: rgb(31 31 112);
                    --g-color-private-brand-850-solid: rgb(27 26 133);
                    --g-color-private-brand-800-solid: rgb(23 22 153);
                    --g-color-private-brand-750-solid: rgb(18 18 173);
                    --g-color-private-brand-700-solid: rgb(14 13 194);
                    --g-color-private-brand-650-solid: rgb(9 9 214);
                    --g-color-private-brand-600-solid: rgb(4 4 235);
                    --g-color-private-brand-500-solid: rgb(4 4 235);
                    --g-color-private-brand-450-solid: rgb(9 9 214);
                    --g-color-private-brand-400-solid: rgb(14 13 194);
                    --g-color-private-brand-350-solid: rgb(18 18 173);
                    --g-color-private-brand-300-solid: rgb(23 22 153);
                    --g-color-private-brand-250-solid: rgb(27 26 133);
                    --g-color-private-brand-200-solid: rgb(31 31 112);
                    --g-color-private-brand-150-solid: rgb(36 35 92);
                    --g-color-private-brand-100-solid: rgb(38 37 82);
                    --g-color-private-brand-50-solid: rgb(41 40 71);
                    --g-color-base-brand: blue;
                    --g-color-base-background: rgb(255,255,255);
                    --g-color-base-brand-hover: var(--g-color-private-brand-650-solid);
                    --g-color-base-selection: var(--g-color-private-brand-150);
                    --g-color-base-selection-hover: var(--g-color-private-brand-300);
                    --g-color-text-link: var(--g-color-private-brand-700-solid);
                    --g-color-text-link-hover: var(--g-color-private-brand-850-solid);
                    --g-color-text-brand: var(--g-color-private-brand-700-solid);
                    --g-color-text-brand-heavy: var(--g-color-private-brand-850-solid);
                    --g-color-line-brand: var(--g-color-private-brand-550-solid);
                }

                .g-root_theme_dark {
                    --g-color-private-brand-50: rgb(0 0 255 / 0.1);
                    --g-color-private-brand-100: rgb(0 0 255 / 0.15);
                    --g-color-private-brand-150: rgb(0 0 255 / 0.2);
                    --g-color-private-brand-200: rgb(0 0 255 / 0.3);
                    --g-color-private-brand-250: rgb(0 0 255 / 0.4);
                    --g-color-private-brand-300: rgb(0 0 255 / 0.5);
                    --g-color-private-brand-350: rgb(0 0 255 / 0.6);
                    --g-color-private-brand-400: rgb(0 0 255 / 0.7);
                    --g-color-private-brand-450: rgb(0 0 255 / 0.8);
                    --g-color-private-brand-500: rgb(0 0 255 / 0.9);
                    --g-color-private-brand-550-solid: rgb(0 0 255);
                    --g-color-private-brand-1000-solid: rgb(217 217 255);
                    --g-color-private-brand-950-solid: rgb(204 204 255);
                    --g-color-private-brand-900-solid: rgb(179 179 255);
                    --g-color-private-brand-850-solid: rgb(153 153 255);
                    --g-color-private-brand-800-solid: rgb(128 128 255);
                    --g-color-private-brand-750-solid: rgb(102 102 255);
                    --g-color-private-brand-700-solid: rgb(77 77 255);
                    --g-color-private-brand-650-solid: rgb(51 51 255);
                    --g-color-private-brand-600-solid: rgb(25 25 255);
                    --g-color-private-brand-500-solid: rgb(25 25 255);
                    --g-color-private-brand-450-solid: rgb(51 51 255);
                    --g-color-private-brand-400-solid: rgb(77 77 255);
                    --g-color-private-brand-350-solid: rgb(102 102 255);
                    --g-color-private-brand-300-solid: rgb(128 128 255);
                    --g-color-private-brand-250-solid: rgb(153 153 255);
                    --g-color-private-brand-200-solid: rgb(179 179 255);
                    --g-color-private-brand-150-solid: rgb(204 204 255);
                    --g-color-private-brand-100-solid: rgb(217 217 255);
                    --g-color-private-brand-50-solid: rgb(230 230 255);
                    --g-color-base-brand: blue;
                    --g-color-base-background: rgb(45, 44, 51);
                    --g-color-base-brand-hover: var(--g-color-private-brand-650-solid);
                    --g-color-base-selection: var(--g-color-private-brand-150);
                    --g-color-base-selection-hover: var(--g-color-private-brand-300);
                    --g-color-text-link: var(--g-color-private-brand-600-solid);
                    --g-color-text-link-hover: var(--g-color-private-brand-850-solid);
                    --g-color-text-brand: var(--g-color-private-brand-600-solid);
                    --g-color-text-brand-heavy: var(--g-color-private-brand-850-solid);
                    --g-color-line-brand: var(--g-color-private-brand-550-solid);
                }`;

                expect(build.run.write).toHaveBeenCalledWith(
                    resolve(build.run.originalOutput, THEME_CSS_PATH),
                    expectedString,
                );
            });
        });
    });
});

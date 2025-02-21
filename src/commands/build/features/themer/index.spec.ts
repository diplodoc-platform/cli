import {compareDirectories} from './__tests__';
import {getTestPaths, runYfmDocs} from '~/../tests/utils';
import {describe, it, expect} from 'vitest';
import {join} from 'node:path';
import {createCSS, createTheme} from './utils';
import {Theme, ThemeConfig} from './types';

const generateMapTestTemplate = (
    testTitle: string,
    testRootPath: string,
    {md2md = true, md2html = true, args = ''},
) => {
    it(testTitle, () => {
        const {inputPath, outputPath} = getTestPaths(join(__dirname, testRootPath));
        runYfmDocs(inputPath, outputPath, {md2md, md2html, args});
        compareDirectories(outputPath);
    });
};

describe('Build themer feature', () => {
    describe('Apply theme', () => {
        generateMapTestTemplate('md2md with theme yaml', '__tests__/mocks/md2md-with-theme-yaml', {
            md2html: false,
        });

        generateMapTestTemplate(
            'md2html with theme yaml',
            '__tests__/mocks/md2html-with-theme-yaml',
            {
                md2md: false,
            },
        );
    });

    describe('Create theme', () => {
        it('Light and dark themes', () => {
            const config: ThemeConfig = {
                light: {
                    'text-brand': 'rgb(0, 255, 0)',
                    'base-misc-light': '#F80000',
                },
                dark: {
                    'note-info-background': 'rgb(0 0 255)',
                    'note-tip-background': 'rgb(106,90,205)',
                },
            };
            const theme = createTheme(config);

            const expectedTheme: Theme = {
                light: {
                    colors: {'text-brand': 'rgb(0, 255, 0)', 'base-misc-light': '#F80000'},
                },
                dark: {
                    colors: {
                        'note-info-background': 'rgb(0 0 255)',
                        'note-tip-background': 'rgb(106,90,205)',
                    },
                },
            };
            expect(theme).toEqual(expectedTheme);
        });

        it('Brand colors from general', () => {
            const config: ThemeConfig = {
                'base-brand': 'rgb(94 33 41)',
            };
            const theme = createTheme(config);

            const expectedTheme: Theme = {
                base: {colors: {'base-brand': 'rgb(94 33 41)'}},
                light: {
                    colors: {
                        'base-brand': 'rgb(94 33 41)',
                        'base-background': 'rgb(255,255,255)',
                        'base-brand-hover': 'var(--g-color-private-brand-650-solid)',
                        'base-selection': 'var(--g-color-private-brand-150)',
                        'base-selection-hover': 'var(--g-color-private-brand-300)',
                        'text-link': 'var(--g-color-private-brand-700-solid)',
                        'text-link-hover': 'var(--g-color-private-brand-850-solid)',
                        'text-brand': 'var(--g-color-private-brand-700-solid)',
                        'text-brand-heavy': 'var(--g-color-private-brand-850-solid)',
                        'line-brand': 'var(--g-color-private-brand-550-solid)',
                    },
                    palette: {
                        '50': 'rgb(94 33 41 / 0.1)',
                        '100': 'rgb(94 33 41 / 0.15)',
                        '150': 'rgb(94 33 41 / 0.2)',
                        '200': 'rgb(94 33 41 / 0.3)',
                        '250': 'rgb(94 33 41 / 0.4)',
                        '300': 'rgb(94 33 41 / 0.5)',
                        '350': 'rgb(94 33 41 / 0.6)',
                        '400': 'rgb(94 33 41 / 0.7)',
                        '450': 'rgb(94 33 41 / 0.8)',
                        '500': 'rgb(94 33 41 / 0.9)',
                        '550-solid': 'rgb(94 33 41)',
                        '1000-solid': 'rgb(52 42 50)',
                        '950-solid': 'rgb(55 42 49)',
                        '900-solid': 'rgb(60 41 48)',
                        '850-solid': 'rgb(65 40 47)',
                        '800-solid': 'rgb(70 39 46)',
                        '750-solid': 'rgb(74 37 45)',
                        '700-solid': 'rgb(79 36 44)',
                        '650-solid': 'rgb(84 35 43)',
                        '600-solid': 'rgb(89 34 42)',
                        '500-solid': 'rgb(89 34 42)',
                        '450-solid': 'rgb(84 35 43)',
                        '400-solid': 'rgb(79 36 44)',
                        '350-solid': 'rgb(74 37 45)',
                        '300-solid': 'rgb(70 39 46)',
                        '250-solid': 'rgb(65 40 47)',
                        '200-solid': 'rgb(60 41 48)',
                        '150-solid': 'rgb(55 42 49)',
                        '100-solid': 'rgb(52 42 50)',
                        '50-solid': 'rgb(50 43 50)',
                    },
                },
                dark: {
                    colors: {
                        'base-brand': 'rgb(94 33 41)',
                        'base-background': 'rgb(45, 44, 51)',
                        'base-brand-hover': 'var(--g-color-private-brand-650-solid)',
                        'base-selection': 'var(--g-color-private-brand-150)',
                        'base-selection-hover': 'var(--g-color-private-brand-300)',
                        'text-link': 'var(--g-color-private-brand-600-solid)',
                        'text-link-hover': 'var(--g-color-private-brand-850-solid)',
                        'text-brand': 'var(--g-color-private-brand-600-solid)',
                        'text-brand-heavy': 'var(--g-color-private-brand-850-solid)',
                        'line-brand': 'var(--g-color-private-brand-550-solid)',
                    },
                    palette: {
                        '50': 'rgb(94 33 41 / 0.1)',
                        '100': 'rgb(94 33 41 / 0.15)',
                        '150': 'rgb(94 33 41 / 0.2)',
                        '200': 'rgb(94 33 41 / 0.3)',
                        '250': 'rgb(94 33 41 / 0.4)',
                        '300': 'rgb(94 33 41 / 0.5)',
                        '350': 'rgb(94 33 41 / 0.6)',
                        '400': 'rgb(94 33 41 / 0.7)',
                        '450': 'rgb(94 33 41 / 0.8)',
                        '500': 'rgb(94 33 41 / 0.9)',
                        '550-solid': 'rgb(94 33 41)',
                        '1000-solid': 'rgb(231 222 223)',
                        '950-solid': 'rgb(223 211 212)',
                        '900-solid': 'rgb(207 188 191)',
                        '850-solid': 'rgb(191 166 169)',
                        '800-solid': 'rgb(175 144 148)',
                        '750-solid': 'rgb(158 122 127)',
                        '700-solid': 'rgb(142 100 105)',
                        '650-solid': 'rgb(126 77 84)',
                        '600-solid': 'rgb(110 55 62)',
                        '500-solid': 'rgb(110 55 62)',
                        '450-solid': 'rgb(126 77 84)',
                        '400-solid': 'rgb(142 100 105)',
                        '350-solid': 'rgb(158 122 127)',
                        '300-solid': 'rgb(175 144 148)',
                        '250-solid': 'rgb(191 166 169)',
                        '200-solid': 'rgb(207 188 191)',
                        '150-solid': 'rgb(223 211 212)',
                        '100-solid': 'rgb(231 222 223)',
                        '50-solid': 'rgb(239 233 234)',
                    },
                },
            };
            expect(theme).toEqual(expectedTheme);
        });
    });

    describe('create css', () => {
        it('Create base css', () => {
            const Theme: Theme = {
                base: {
                    colors: {
                        'base-brand': 'rgb(94 33 41)',
                        'note-tip-background': 'rgb(106, 90, 205)',
                    },
                },
            };
            expect(createCSS(Theme)).toMatchSnapshot();
        });

        it('Create light css', () => {
            const Theme: Theme = {
                light: {
                    colors: {
                        'base-brand': 'rgb(48, 149, 232)',
                        'base-background': 'rgb(255,255,255)',
                    },
                    palette: {
                        '50': 'rgb(94 33 41 / 0.1)',
                        '100': 'rgb(94 33 41 / 0.15)',
                    },
                },
            };
            expect(createCSS(Theme)).toMatchSnapshot();
        });

        it('Create dark css', () => {
            const Theme: Theme = {
                light: {
                    colors: {
                        'base-brand': 'rgb(220, 48, 232)',
                        'base-background': 'rgb(255,255,255)',
                    },
                    palette: {
                        '50': 'rgb(94 33 41 / 0.1)',
                        '100': 'rgb(94 33 41 / 0.15)',
                    },
                },
            };
            expect(createCSS(Theme)).toMatchSnapshot();
        });

        it('Create full css', () => {
            const Theme: Theme = {
                base: {
                    colors: {
                        'base-brand': 'rgb(94 33 41)',
                        'note-tip-background': 'rgb(106, 90, 205)',
                    },
                },
                light: {
                    colors: {
                        'base-brand': 'rgb(48, 149, 232)',
                        'base-background': 'rgb(255,255,255)',
                    },
                    palette: {
                        '50': 'rgb(94 33 41 / 0.1)',
                        '100': 'rgb(94 33 41 / 0.15)',
                    },
                },
                dark: {
                    colors: {
                        'base-brand': 'rgb(58, 228, 143)',
                        'base-background': 'rgb(45, 44, 51)',
                    },
                    palette: {
                        '50': 'rgb(94 33 41 / 0.1)',
                        '100': 'rgb(94 33 41 / 0.15)',
                    },
                },
            };
            expect(createCSS(Theme)).toMatchSnapshot();
        });

        it('Create empty css', () => {
            const Theme: Theme = {};
            expect(createCSS(Theme)).toMatch('');
        });
    });
});

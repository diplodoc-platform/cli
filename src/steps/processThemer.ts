import {join} from 'path';
import {resolveConfig, scope as scopeConfig, strictScope as strictScopeConfig} from '~/config';
import {THEME_CONFIG_FILENAME} from '~/constants';
import {isAbsolute, resolve} from 'node:path';

import {ArgvService} from '~/services';
import {isRelative} from '~/program/utils';
import {ThemeConfig} from '~/models';
import { initThemeCreator } from './themer/lib/themeUtils';
import { DEFAULT_THEME } from './themer';
import { exportThemeForCSS } from './themer/themeCreatorExport';
import { updateColorInTheme } from './themer/themeCreatorUtils';

/**
 * @param {Array} args
 * @param {string} outputBundlePath
 * @param {string} outputFormat
 * @param {string} tmpOutputFolder
 * @return {void}
 */
type Props = {
    // args: string[];
    args: Record<string, any>;
    outputBundlePath: string;
    tmpOutputFolder: string;
};

export async function processThemer({
    args,
    outputBundlePath,
    tmpOutputFolder,
}: Props): Promise<void> {
    const {input} = ArgvService.getConfig();

    // получаем путь к конфигу темы
    const themeConfigPath =
        isAbsolute(THEME_CONFIG_FILENAME) || isRelative(THEME_CONFIG_FILENAME)
            ? resolve(THEME_CONFIG_FILENAME)
            : resolve(input, THEME_CONFIG_FILENAME);

    console.log('themeConfigPath', themeConfigPath);

    // ?: what about unnecessary props like:
    // * [Symbol(configRoot)]: '/Users/bagautdinovrl/Desktop/projects/diplodoc-meta-3/docs',
    // * [Symbol(configPath)]: '/Users/bagautdinovrl/Desktop/projects/diplodoc-meta-3/docs/theme.yaml
    // получаем содержимое конфига темы
    const theme: ThemeConfig = (await resolveConfig(themeConfigPath, {
        // filter: filter || undefined,
        defaults: () => {},
        // fallback: () => {},
    })) as ThemeConfig;

    console.log('theme', theme);

    // создаём объект темы по умолчанию
    const createdThemeState = initThemeCreator(DEFAULT_THEME);

    // экспортируем объект темы в текст перед тем как поместить его в файл
    // (функция должна возвращать CSS, но сейчас возвращает SCSS)
    // TODO 1: переделать возвращаемый формат в CSS-код
    // TODO 2: вызывать эту функцию только тогда, когда стало известно есть ли в theme.yaml что-то
    //         и когда настройки были применены
    const themeStyles = exportThemeForCSS({themeState: createdThemeState});

    // обновляет тему, а именно brand-color в ней
    // в данном примере делает это только для light темы, потому value берётся из theme.light
    const newThemeState = updateColorInTheme(createdThemeState, {
        title: 'brand',
        value: theme.light?.['brand-color'] ?? '',
        theme: 'light',
    });


    console.log('THEME RESULT', themeStyles);
    console.log('CHANGED THEME STATE', newThemeState);

    // TODO: тут должны быть другие изменения на основе других настроек
    // ...

    // TODO: экспорт итоговой темы в текст
    // const themeStyles = exportThemeForCSS({themeState: newThemeState});

    // TODO: экспорт итоговой темы в файл
    // someExportToFileMethod({ text: themeStyles });

    // * ниже идут вырезки из tsx-кода с использованием тех или иных функций,
    // которые нужно использовать тут в processThemer
    // ====================== EXAMPLE 1 =============================
    // * BASED ON COLOR PRESET
    // const chooseColor = (colorName: string) => {
    //     let index = -1;

    //     if (colorName === 'red') {
    //         index = 5;
    //     }
    //     if (colorName === 'blue') {
    //         index = 1;
    //     }
    //     if (colorName === 'yellow') {
    //         index = 0;
    //     }

    //     return () => {
    // ***
    // * applyBrandPresetToTheme позволяет применить пресет для brand-color
    // * то есть использовать готовый цвет, а не свой цвет в RGB
    // * это можно использовать для более простой кастомизации через конфиг
    // ***
    //         const newState = applyBrandPresetToTheme(localThemeState, BRAND_COLORS_PRESETS[index]);

    //         setThemeState(newState);
    //     };
    // };
    // <input
    // id={'brand-color-picker'}
    // type={'color'}
    // onChange={(e: FormEvent<HTMLInputElement>) => {
    //     const rgbColor = hexToRgb(e.currentTarget.value);
    //     setThemeState(newThemeState);
    // }}
    // />
    // ================================================================================

    // ====================== EXAMPLE 2 =============================
    // <input
    //     id={'background-color-picker'}
    //     type={'color'}
    //     onChange={(e: FormEvent<HTMLInputElement>) => {
    //         const rgbColor = hexToRgb(e.currentTarget.value);
    // ***
    // * changeUtilityColorInTheme с аргументом base-background позволяет изменить цвет фона
    // ***
    //         const newThemeState = changeUtilityColorInTheme(localThemeState, {
    //             name: 'base-background',
    //             value: rgbColor ?? e.currentTarget.value,
    //             themeVariant: 'light',
    //         });

    //         setThemeState(newThemeState);
    //     }}
    // />
    // ========================================================================

    // ============================== EXAMPLE 3 ===============================
    // <input
    // id={'black-text'}
    // name={'text-on-brand'}
    // value={'black'}
    // type={'radio'}
    // onClick={(event: FormEvent<HTMLInputElement>) => {
    // ***
    // * changeUtilityColorInTheme с аргументом text-brand-contrast позволяет изменить цвет текста,
    // * который находится на элементах, цвет который задан как brand-color
    // * НАПРИМЕР: цвет текста на кнопке с брендовым цветом
    // ***
    //     const newThemeState = changeUtilityColorInTheme(localThemeState, {
    //         name: 'text-brand-contrast',
    //         value:
    //             event.currentTarget.value === 'white'
    //                 ? 'rgb(255,255,255)'
    //                 : 'rgba(0,0,0, 0.9)',
    //         themeVariant: 'light',
    //     });

    //     setThemeState(newThemeState);
    // }}
    // checked
    // />

    // <input
    //     id={'white-text'}
    //     name={'text-on-brand'}
    //     value={'white'}
    //     type={'radio'}
    //     onClick={(event: FormEvent<HTMLInputElement>) => {
    //         console.log(event.currentTarget.value);
    // ***
    // * Тот же самый "changeUtilityColorInTheme" с аргументом text-brand-contrast, но другим значением
    // * суть в том, что у текста должно быть только два возможных цвета: чёрный и белый,
    // * так реализовано у @gravity-ui, и так мы не позволим пользователю делать недоступный с точки зрения
    // * контрастности интерфейс
    // ***
    //         const newThemeState = changeUtilityColorInTheme(localThemeState, {
    //             name: 'text-brand-contrast',
    //             value:
    //                 event.currentTarget.value === 'white'
    //                     ? 'rgb(255,255,255)'
    //                     : 'rgba(0,0,0, 0.9)',
    //             themeVariant: 'light',
    //         });
    //         setThemeState(newThemeState);
    //     }}
    // />
    // ========================================================================
}


// * Если понадобится поддержка цветов в HEX-формате (при передаче в конфиг),
// * то можно использовать эту функцию
// function hexToRgb(hex: string) {
//     const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})?$/i.exec(hex);

//     return result
//         ? `rgb${result[4] ? 'a' : ''}(${parseInt(result[1], 16)},${parseInt(
//               result[2],
//               16,
//           )},${parseInt(result[3], 16)}${result[4] ? ',' + parseInt(result[4], 16) : ''})`
//         : null;
// }

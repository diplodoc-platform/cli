import {TextSizes, Theme} from '@doc-tools/components';

const DEFAULT_USER_SETTINGS = {
    theme: Theme.Light,
    textSize: TextSizes.M,
    showMiniToc: true,
    wideFormat: true,
    fullScreen: false,
};

export function getDocSettings() {
    const {
        theme: defaultTheme,
        textSize: defaultTextSize,
        showMiniToc: defaultShowMiniToc,
        wideFormat: defaultWideFormat,
        fullScreen: defaultFullScreen,
    } = DEFAULT_USER_SETTINGS;

    const theme = getSetting('theme') as Theme || defaultTheme;
    const textSize = getSetting('textSize') as TextSizes || defaultTextSize;
    const showMiniToc = getSetting('showMiniToc') || defaultShowMiniToc;
    const wideFormat = getSetting('wideFormat') || defaultWideFormat;
    const fullScreen = getSetting('fullScreen') || defaultFullScreen;

    return {
        theme,
        textSize,
        showMiniToc: strToBoolean(showMiniToc),
        wideFormat: strToBoolean(wideFormat),
        fullScreen: strToBoolean(fullScreen),
    };
}

export function getSetting(name: string) {
    if (typeof sessionStorage === 'undefined') {
        return null;
    }
    return sessionStorage.getItem(name);
}

export function saveSetting<T>(name: string, value: T) {
    if (typeof sessionStorage === 'undefined') {
        return;
    }
    sessionStorage.setItem(name, String(value));
}

export function strToBoolean(str: string | boolean) {
    if (typeof str === 'boolean') {
        return str;
    }

    return str ? str === 'true' : false;
}

export function withSavingSetting<T>(settingName: string, onChange: (value: T) => void) {
    return (value: T) => {
        saveSetting<T>(settingName, value);

        onChange(value);
    };
}

export function updateRootClassName(theme: Theme, isMobile = false) {
    const themeClassName = theme === 'light' ? 'yc-root_theme_light' : 'yc-root_theme_dark';
    const mobileClassName = isMobile ? 'mobile' : '';

    document.body.className = `yc-root ${themeClassName} ${mobileClassName}`;
}

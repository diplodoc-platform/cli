import {YFM_PLUGINS} from '../constants';

export function getPlugins() {
    const customPlugins = getCustomPlugins();

    return [...YFM_PLUGINS, ...customPlugins];
}

export function getCustomPlugins() {
    try {
        return requireDynamically('./plugins');
    } catch (e) {
        return [];
    }
}

// https://github.com/webpack/webpack/issues/4175#issuecomment-323023911
export function requireDynamically(path: string) {
    return eval(`require('${path}');`); // Ensure Webpack does not analyze the require statement
}

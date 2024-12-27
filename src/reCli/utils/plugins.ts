import {
    getCollectOfPlugins as getCollectOfPluginsLegacy,
    getPlugins as getPluginsLegacy,
    setPlugins,
} from '~/services/plugins';

export function getPlugins() {
    const plugins = getPluginsLegacy();
    if (!plugins?.length) {
        setPlugins();
    }
    return getPluginsLegacy();
}

export function getCollectOfPlugins() {
    if (!getPluginsLegacy()?.length) {
        setPlugins();
    }
    return getCollectOfPluginsLegacy();
}

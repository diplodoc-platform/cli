import {getPlugins as getPluginsLegacy, setPlugins} from '~/services/plugins';

export function getPlugins() {
    const plugins = getPluginsLegacy();
    if (!plugins?.length) {
        setPlugins();
    }
    return getPluginsLegacy();
}

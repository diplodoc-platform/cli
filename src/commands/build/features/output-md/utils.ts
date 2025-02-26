import type {CollectPlugin} from '~/core/markdown';

type Plugin = {
    collect?: CollectPlugin;
};

// TODO(major): Deprecate
export function getCustomCollectPlugins(): CollectPlugin[] {
    try {
        const plugins: Plugin[] = require(require.resolve('./plugins'));
        const collects = (Array.isArray(plugins) ? plugins : []).map((plugin) => plugin.collect);

        return collects.filter(Boolean) as CollectPlugin[];
    } catch (e) {
        return [];
    }
}

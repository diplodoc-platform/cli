type InternalBuildArgs = {
    internalBuild?: boolean;
    vcs?: boolean;
    extensions?: string[];
};

type Extension = string | {name: string};

function extensionName(extension: Extension): string {
    const name = typeof extension === 'string' ? extension : extension.name;

    return name === '@diplodoc/cli/arcadia-vcs' ? 'arcadia-vcs' : name;
}

function mergeExtensions(root: Extension[], scoped: Extension[]): Extension[] {
    const extensions = new Map<string, Extension>();

    for (const list of [root, scoped]) {
        for (const extension of list) {
            extensions.set(extensionName(extension), extension);
        }
    }

    return Array.from(extensions.values());
}

/** Apply CI defaults before extension discovery without changing the source config. */
export function applyInternalBuildDefaults(config: Hash, args: InternalBuildArgs): void {
    if (!args.internalBuild) {
        return;
    }

    const build = config.build && typeof config.build === 'object' ? config.build : config;
    if (
        [config['docs-viewer'], build['docs-viewer']].some(
            (viewer) => viewer?.['is-external'] === true || viewer?.['is-new-external'] === true,
        )
    ) {
        return;
    }

    for (const flag of ['vcs', 'mtimes']) {
        if (!Object.prototype.hasOwnProperty.call(build, flag)) {
            build[flag] = true;
        }
    }

    const vcs = args.vcs ?? build.vcs;
    const enabled = typeof vcs === 'object' && vcs !== null ? vcs.enabled !== false : vcs === true;

    if (!enabled) {
        return;
    }

    const rootExtensions: Extension[] = config.extensions ?? [];
    // Initial discovery reads the root; scoped options override shared extensions once.
    const extensions =
        build === config ? rootExtensions : mergeExtensions(rootExtensions, build.extensions ?? []);
    const hasConnector =
        extensions.some((extension) => extensionName(extension) === 'arcadia-vcs') ||
        args.extensions?.some((extension) => extensionName(extension) === 'arcadia-vcs');

    const effective = hasConnector ? extensions : [...extensions, 'arcadia-vcs'];

    build.extensions = effective;
    config.extensions = effective;
}

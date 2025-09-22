module.exports = (aliases) => {
    const keys = Object.keys(aliases);

    const match = (path) => {
        for (const key of keys) {
            if (key.endsWith('$')) {
            }

            const match = key.endsWith('$') ? path.endsWith(key) : path.match(key);

            if (match) {
                return [key, aliases[key]];
            }
        }

        return [null, []];
    };

    return {
        name: 'alias',
        setup(build) {
            build.onResolve({filter: /.*/}, async ({path, kind, resolveDir}) => {
                if (kind === 'entry-point') {
                    return;
                }

                const [key, [alias, external]] = match(path);
                if (alias) {
                    if (!external) {
                        return {
                            path: await build.resolve(path.replace(key, alias), {kind, resolveDir}),
                        };
                    }

                    return {
                        path: path.replace(key, alias),
                        external,
                    };
                }
            });
        },
    };
};

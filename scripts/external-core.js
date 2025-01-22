const {resolve} = require('path');

module.exports = (paths) => {
    const pathKeys = Object.keys(paths);

    return {
        name: 'externals',
        setup(build) {
            build.onResolve({filter: /.*/}, ({path, resolveDir}) => {
                if (!isRelative(path)) {
                    return;
                }

                const fullPath = resolve(resolveDir, path);
                const pathKey = pathKeys.find((pkey) => fullPath.startsWith(pkey));

                if (!pathKey) {
                    return;
                }

                const pathValue = paths[pathKey];

                return {
                    path: fullPath.replace(pathKey, pathValue),
                    external: true,
                };
            });
        },
    };
};


function isRelative(path) {
    return /\.{1,2}\//.test(path);
}

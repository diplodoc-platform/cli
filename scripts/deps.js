module.exports = (externals) => {
    return {
        name: 'deps',
        setup(build) {
            build.onResolve({ filter: /.*/ }, ({path, kind}) => {
                const isExternal = !path.startsWith('.') && !path.startsWith('~');
                const isNodeOwned = path.startsWith('node:') || ['process', 'os'].includes(path);
                if (isExternal && !isNodeOwned) {
                    externals.add(path.split('/').slice(0, 2).join('/'));
                }
            });
        },
    };
};

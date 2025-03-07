const {minimatch} = require("minimatch");

module.exports = () => {
    const matches = ['./**'].map((match) => minimatch.filter(match));

    return {
        name: 'bundle',
        setup(build) {
            build.onResolve({ filter: /.*/ }, ({path, kind}) => {
                if (kind === 'entry-point') {
                    return {};
                }

                const external = !matches.some((match) => match(path));

                return { external };
            });
        },
    };
};

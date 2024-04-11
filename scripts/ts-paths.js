const {resolve, join} = require('path');
const {readFileSync} = require('fs');
const {sync: glob} = require('glob');
const normalize = require('normalize-path');

function stripJsonComments(data) {
    return data.replace(/\\"|"(?:\\"|[^"])*"|(\/\/.*|\/\*[\s\S]*?\*\/)/g, (m, g) => (g ? "" : m));
}

module.exports = (relativeTsconfigPath = './tsconfig.json') => {
    const absTsconfigPath = resolve(process.cwd(), relativeTsconfigPath);

    const tsconfigData = stripJsonComments(readFileSync(absTsconfigPath, 'utf8'));

    const { compilerOptions } = JSON.parse(tsconfigData);

    const pathKeys = Object.keys(compilerOptions.paths);
    const re = new RegExp(`^(${pathKeys.join('|')})`);
    return {
        name: 'ts-paths',
        setup(build) {
            build.onResolve({ filter: re }, (args) => {
                const pathKey = pathKeys.find((pkey) => new RegExp(`^${pkey}`).test(args.path));
                const [pathDir] = pathKey.split('*');

                let file = args.path.replace(pathDir, '');
                if (file === args.path) { // if importing from root of alias
                    file = '';
                }

                for (const dir of compilerOptions.paths[pathKey]) {
                    const fileDir = normalize(resolve(process.cwd(), dir).replace('*', file));

                    let [matchedFile] = glob(`${fileDir}.+(ts|tsx|js|jsx)`);
                    if (!matchedFile) {
                        const [matchIndexFile] = glob(normalize(fileDir + '/index.+(ts|tsx|js|jsx)'));
                        matchedFile = matchIndexFile;
                    }

                    if (matchedFile) {
                        return { path: matchedFile };
                    }
                }

                return { path: args.path };
            });
        },
    };
};

module.exports = {
    extends: ['@diplodoc/eslint-config'],
    root: true,
    parserOptions: {
        tsconfigRootDir: __dirname,
        project: true,
    },
    env: {
        node: true,
    },
};

module.exports = {
    "extends": ["@diplodoc/eslint-config"],
    "root": true,
    parserOptions: {
        tsconfigRootDir: __dirname,
        project: ['./tsconfig.json'],
      },
    "env": {
        "node": true
    }
}

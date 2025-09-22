module.exports = {
    '**/*.{js,mjs,cjs,jsx,ts,mts,cts,tsx}': ['prettier --write', 'eslint --max-warnings=0 --fix'],
    '**/*.{css,scss}': ['prettier --write', 'stylelint --fix'],
    '**/*.{json,yaml,yml,md}': ['prettier --write'],
    '**/*.{svg,svgx}': ['svgo'],
};

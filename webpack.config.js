const {resolve} = require('path');
const {BannerPlugin} = require('webpack');

const webConfig = {
    mode: 'development',
    target: 'web',
    entry: './src/app/index.tsx',
    output: {
        path: resolve(__dirname, 'build'),
        filename: 'app.js',
    },
    resolve: {
        alias: {
            react: require.resolve('react'),
        },
        extensions: ['.tsx', '.ts', '.js', '.scss'],
    },
    module: {
        rules: [
            {
                test: /\.[tj]sx?$/,
                use: ['babel-loader'],
                include: [
                    resolve(__dirname, 'src'),
                    require.resolve('@diplodoc/mermaid-extension'),
                ],
            }, {
                test: /\.s?css$/,
                use: [
                    {
                        loader: 'style-loader',
                        options: {
                            insert: function insertBeforeAt(element) {
                                /* eslint-env browser */
                                const parent = document.querySelector('head');
                                const target = document.querySelector('#custom-style');

                                const lastInsertedElement =
                                    window._lastElementInsertedByStyleLoader;

                                if (!lastInsertedElement) {
                                    parent.insertBefore(element, target);
                                } else if (lastInsertedElement.nextSibling) {
                                    parent.insertBefore(
                                        element,
                                        lastInsertedElement.nextSibling,
                                    );
                                } else {
                                    parent.appendChild(element);
                                }

                                window._lastElementInsertedByStyleLoader = element;
                            },
                        },
                    },
                    {loader: 'css-loader'},
                    {loader: 'sass-loader'},
                ],
            }, {
                test: /\.svg$/,
                loader: 'react-svg-loader',
            },
        ],
    },
};

const ssrConfig = {
    ...webConfig,
    mode: 'production',
    target: 'node',
    devtool: 'source-map',
    module: {
        rules: [
            {
                test: /\.[tj]sx?$/,
                use: ['babel-loader'],
                include: [
                    resolve(__dirname, 'src'),
                    require.resolve('@diplodoc/mermaid-extension'),
                ],
            }, {
                test: /\.s?css$/,
                use: [
                    {loader: 'style-loader', options: {injectType: 'lazyStyleTag'}},
                    {loader: 'css-loader'},
                    {loader: 'sass-loader'},
                ],
            }, {
                test: /\.svg$/,
                loader: 'react-svg-loader',
            },
        ],
    },
};

module.exports = [
    webConfig,
    {
        ...ssrConfig,
        entry: './src/index.ts',
        output: {
            ...ssrConfig.output,
            filename: 'index.js',
        },
        plugins: [
            new BannerPlugin({
                banner: '#!/usr/bin/env node',
                raw: true,
            }),
        ],
    },
    {
        ...ssrConfig,
        entry: './src/workers/linter/index.ts',
        output: {
            ...ssrConfig.output,
            filename: 'linter.js',
        },
    },
];

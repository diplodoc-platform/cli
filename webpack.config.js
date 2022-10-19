const webpack = require('webpack');
const {resolve} = require('path');
const ThreadsPlugin = require('threads-plugin');

const conditions = [
    (req) => req.includes('@yandex-cloud/nodejs-sdk'),
];

const filterBy = (predicates) =>
    (req) => predicates.every((predicate) => predicate(req));

const shouldExcludeDependency = filterBy(conditions);

module.exports = [
    {
        mode: 'production',
        target: 'web',
        entry: './src/app/index.tsx',
        output: {
            path: resolve(__dirname, 'build'),
            filename: 'app.js',
        },
        resolve: {
            extensions: ['.tsx', '.ts', '.js', '.scss'],
        },
        module: {
            rules: [
                {
                    test: /\.[tj]sx?$/,
                    use: ['babel-loader'],
                    exclude: /node_modules/,
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
    },
    {
        mode: 'production',
        target: 'node',
        entry: './src/index.ts',
        devtool: 'eval-source-map',
        resolve: {
            extensions: ['.tsx', '.ts', '.js'],
        },
        output: {
            path: resolve(__dirname, 'build'),
            filename: 'index.js',
        },
        module: {
            rules: [{
                test: /\.[tj]sx?$/,
                use: ['babel-loader'],
                exclude: /node_modules/,
            }],
        },
        plugins: [
            new webpack.BannerPlugin({banner: '#!/usr/bin/env node', raw: true}),
            new webpack.DefinePlugin({
                VERSION: JSON.stringify(require('./package.json').version),
            }),
            new ThreadsPlugin(),
        ],
        externals: [
            function (context, request, callback) {
                if (shouldExcludeDependency(request)) {
                    return callback(null, 'commonjs ' + request);
                }

                return callback();
            },
        ],
    },
];

const webpack = require('webpack');
const {resolve} = require('path');

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
                        'style-loader',
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
        ],
    },
];

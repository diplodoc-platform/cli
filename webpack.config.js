const webpack = require('webpack');
const path = require('path');

module.exports = {
    mode: 'production',
    entry: './src/index.ts',
    output: {
        library: 'yfm-poc',
        path: path.resolve(__dirname, 'build'),
        filename: 'index.js',
        libraryTarget: 'umd',
        globalObject: 'global'
    },
    resolve: {
        alias: {
            Assets: path.resolve(__dirname, 'src/assets/')
        },
        extensions: ['.tsx', '.ts', '.js', '.scss']
    },
    externals: {
        yargs: 'yargs',
        path: 'path',
        fs: 'fs'
    },
    module: {
        rules: [
            {
                test: /\.tsx?$/,
                use: ['ts-loader'],
                exclude: /node_modules/
            }, {
                test: /\.scss$/,
                use: [
                    'isomorphic-style-loader',
                    {
                        loader: 'css-loader',
                        options: {
                            importLoaders: 1
                        }
                    },
                    'sass-loader'
                ]
            }, {
                test: /\.(png|jpg|gif)$/i,
                use: [
                    {
                        loader: 'url-loader',
                        options: {
                            // Transforms images to base64
                            limit: true,
                        },
                    },
                ],
            },  {
                test: /\.svg$/,
                loader: 'svg-react-loader'
            }
        ]
    },
    plugins: [
        new webpack.BannerPlugin({banner: '#!/usr/bin/env node', raw: true}),
    ],
};

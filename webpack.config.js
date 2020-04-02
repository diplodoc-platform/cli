const webpack = require('webpack');
const {resolve} = require('path');

const srcDir = resolve(__dirname, './src/app');
const modulesDir = resolve(srcDir, '../node_modules');

module.exports = {
    mode: 'development',
    entry: './src/index.ts',
    output: {
        library: 'yfm-docs',
        path: resolve(__dirname, 'build'),
        filename: 'index.js',
        libraryTarget: 'umd',
        globalObject: 'global'
    },
    resolve: {
        alias: {
            interceptors: resolve(__dirname, srcDir, 'interceptors'),
            constants$: resolve(__dirname, './src/constants.ts'),
            components: resolve(__dirname, srcDir, 'components'),
            providers: resolve(__dirname, srcDir, 'providers'),
            contexts: resolve(__dirname, srcDir, 'contexts'),
            styles: resolve(__dirname, srcDir, 'styles'),
            router: resolve(__dirname, srcDir, 'router'),
            assets: resolve(__dirname, srcDir, 'assets'),
            hoc: resolve(__dirname, srcDir, 'hoc'),
        },
        extensions: ['.tsx', '.ts', '.js', '.scss']
    },
    externals: {
        yargs: 'yargs',
        path: 'path',
        fs: 'fs',
        'lego-on-react': 'lego-on-react',
        '@yandex-data-ui/i18n': '@yandex-data-ui/i18n'
    },
    module: {
        rules: [
            {
                test: /\.jsx?$/,
                use: ['babel-loader'],
                exclude: /node_modules/,
                include: [
                    srcDir,
                    resolve(modulesDir, 'lego-on-react'),
                    resolve(modulesDir, '@yandex-data-ui/react-components/src/components/RangeInputPicker'),
                    resolve(modulesDir, '@yandex-data-ui/cloud-components'),
                    resolve(modulesDir, '@yandex-data-ui/common'),
                ]
            }, {
                test: /\.tsx?$/,
                use: ['ts-loader'],
                exclude: /node_modules/
            }, {
                test: /\.s?css$/,
                use: [
                    'isomorphic-style-loader',
                    {
                        loader: 'css-loader',
                        options: {
                            importLoaders: 1,
                            // HACK: don't handle breaking fonts from cloud-components
                            url: (url) => !url.endsWith('.woff2'),
                        }
                    },
                    {
                        loader: 'sass-loader',
                        options: {
                            sassOptions: {
                                includePaths: [resolve(srcDir, 'styles'), srcDir],
                            },
                        }
                    }
                ]
            }, {
                test: /\.woff2?$/,
                include: [
                    srcDir,
                    resolve(modulesDir, '@yandex-data-ui/cloud-components/assets/fonts'),
                ],
                loader: 'url-loader',
                options: {
                    limit: 8192,
                    name: 'assets/fonts/[name].[hash:8].[ext]',
                    fallback: 'file-loader',
                    publicPath: ``,
                },
            }, {
                test: /\.(png|jpg|gif|svg)$/i,
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
                loader: 'svg-sprite-loader',
                include: [
                    resolve(modulesDir, '@yandex-data-ui/cloud-components/assets/icons'),
                    resolve(modulesDir, '@yandex-data-ui/common/assets/icons'),
                    resolve(modulesDir, '@yandex-data-ui/common/assets/illustrations'),
                ]
            }
        ]
    },
    plugins: [
        new webpack.BannerPlugin({banner: '#!/usr/bin/env node', raw: true}),
    ],
};

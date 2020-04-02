import React from 'react';
import {renderToString} from 'react-dom/server';
import StyleContext from 'isomorphic-style-loader/StyleContext';

import yfmHelper from '!!raw-loader!yfm-transform/dist/js/yfm';
import linkInterceptor from '!!raw-loader!interceptors/leading-page-links';

import App from './components/App/App';

export function generateStaticMarkup(props: any): string {
    const css = new Set();
    const insertCss: Function = (...styles: any[]) => styles.forEach(style => css.add(style._getCss()));
    const body = renderToString(
        // @ts-ignore
        <StyleContext.Provider value={{insertCss}}>
            <App {...props}/>
        </StyleContext.Provider>
    );

    return `
        <!DOCTYPE html>
        <html>
            <head>
                <meta charset="utf-8">
                <title>Test PoC</title>
                <style type="text/css">${[...css].join('')}</style>
            </head>
            <body class="yc-root yc-root_theme_light">
                <div id="root">${body}</div>
                <script type="application/javascript">
                    ${yfmHelper}
                    ${linkInterceptor}
                </script>
            </body>
        </html>
    `;
}

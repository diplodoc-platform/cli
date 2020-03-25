import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import StyleContext from 'isomorphic-style-loader/StyleContext';

import App from './components/App/App';

export function generateStaticMarkup(value: string): string {
    const css = new Set();
    const insertCss: Function = (...styles: any[]) => styles.forEach(style => css.add(style._getCss()));
    const body = renderToStaticMarkup(
        // @ts-ignore
        <StyleContext.Provider value={{insertCss}}>
            <App value={value}/>
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
            <body>
                <div id="root">${body}</div>
            </body>
        </html>
    `;
}

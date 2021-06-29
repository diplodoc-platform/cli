import {SinglePageResult} from '../models';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function generateStaticMarkup(props: any, pathToBundle: string) {
    return `
        <!DOCTYPE html>
        <html>
            <head>
                <meta charset="utf-8">
                ${getMetadata(props.data.meta)}
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>${props.data.toc.title}</title>
                <style type="text/css">
                    body {
                        height: 100vh;
                    }
                </style>
            </head>
            <body class="yc-root yc-root_theme_light">
                <div id="root"></div>
                <script type="application/javascript">
                   window.__DATA__ = ${JSON.stringify(props)};
                </script>
                <script type="application/javascript" src="${pathToBundle}/app.js"></script>
            </body>
        </html>
    `;
}

function getMetadata(metadata: Record<string, string>): string {
    if (!metadata) {
        return '';
    }

    const metaEntries = Object.entries(metadata);

    return metaEntries
        .map(([name, content]) => {
            return `<meta name="${name}" content="${content}">`;
        })
        .join('\n');
}

export const joinSinglePageResults = (singlePageResults: SinglePageResult[]) => {
    const delimeter = '\n\n<hr class="yfm-page__delimeter">\n\n';
    return singlePageResults
        .filter(({content}) => content)
        .map(({content}) => content)
        .join(delimeter);
};

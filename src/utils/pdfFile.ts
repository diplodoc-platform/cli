import yfmStyles from '@doc-tools/transform/dist/css/yfm.css';
import yfmJS from '@doc-tools/transform/dist/js/yfm.js';
import {join} from 'path';
import {SINGLE_PAGE_DATA_FILENAME} from '../constants';

export function generatePdfStaticMarkup(html: string) {
    return `
<!doctype html>
<html>
<head>
    <meta charset="UTF-8"/>
    <style>
        ${yfmStyles}
    </style>
    <style>
        .yfm {
            margin: 0 auto;
            min-width: 200px;
            max-width: 980px;
            padding: 45px;
        }
    </style>
</head>
<body class="yfm">
    ${html}
    <script>
        ${yfmJS}
    </script>
</body>
</html>
    `.trim();
}

export function prepareGlobs(items: string[]) {
    return items.map((item) => join(item, SINGLE_PAGE_DATA_FILENAME));
}

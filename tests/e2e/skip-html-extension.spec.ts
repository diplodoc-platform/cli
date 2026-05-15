import {describe} from 'vitest';

import {generateMapTestTemplate} from '../fixtures';

describe('Skip html extension', () => {
    generateMapTestTemplate(
        'correctly trims .html and index.html on multilingual docs',
        'mocks/skip-html-extension/multilingual',
        {md2md: false, md2html: true, args: '-j2 --skip-html-extension'},
    );

    generateMapTestTemplate(
        'correctly trims .html and index.html on monolingual docs',
        'mocks/skip-html-extension/monolingual',
        {md2md: false, md2html: true, args: '-j2 --skip-html-extension'},
    );
});

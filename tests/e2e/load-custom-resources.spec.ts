import {describe} from 'vitest';

import {generateMapTestTemplate} from '../fixtures';

describe('Allow load custom resources', () => {
    generateMapTestTemplate(
        'md2md with custom resources',
        'mocks/load-custom-resources/md2md-with-resources',
        {md2html: false, args: '--allow-custom-resources'},
    );

    generateMapTestTemplate(
        'md2html with custom resources',
        'mocks/load-custom-resources/md2html-with-resources',
        {md2md: false, args: '--allow-custom-resources'},
    );

    generateMapTestTemplate(
        'md2html single page with custom resources',
        'mocks/load-custom-resources/single-page-with-resources',
        {md2md: false, args: '--allow-custom-resources --single-page'},
    );
});

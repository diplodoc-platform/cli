import {describe} from 'vitest';

import {generateMapTestTemplate} from '../fixtures';

describe('Markdown options from .yfm config', () => {
    generateMapTestTemplate(
        'Markdown options from .yfm config 1',
        'mocks/markdown-options/example-1',
        {md2html: true, md2md: false, args: '-j2'},
    );

    generateMapTestTemplate(
        'Markdown options from .yfm config 2',
        'mocks/markdown-options/example-2',
        {md2html: true, md2md: false, args: '-j2'},
    );
});

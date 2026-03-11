import {describe} from 'vitest';

import {generateMapTestTemplate} from '../fixtures';

describe('Generate html document with correct lang and dir attributes. Load correct bundles.', () => {
    generateMapTestTemplate(
        'documentation with rtl and ltr langs',
        'mocks/rtl/multidirectional-languages',
        {md2html: true, md2md: false, args: '--allow-custom-resources'},
    );

    generateMapTestTemplate('documentation with only one rtl lang', 'mocks/rtl/rtl-language', {
        md2html: true,
        md2md: false,
        args: '--allow-custom-resources',
    });
});

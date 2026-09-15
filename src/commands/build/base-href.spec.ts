import {describe} from 'vitest';

import {testConfig} from './__tests__';

describe('baseHref config', () => {
    testConfig(
        'normalizes the .yfm value',
        '',
        {baseHref: 'https://config.example/docs'},
        {baseHref: 'https://config.example/docs/'},
    );

    testConfig(
        'lets the CLI value override .yfm',
        '--base-href https://cli.example/docs',
        {baseHref: 'https://config.example/docs/'},
        {baseHref: 'https://cli.example/docs/'},
    );

    testConfig('treats an empty .yfm value as absent', '', {baseHref: ''}, {baseHref: undefined});
});

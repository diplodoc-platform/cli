import {expect, test} from 'vitest';

import {isTextPointer} from './text-fields';

test.each([
    ['/info/title', true],
    ['/info/summary', false],
    ['/info/license/description', false],
    ['/servers/0/variables/dome/description', true],
    ['/components/parameters/Lens/description', true],
    ['/components/schemas/Spectrograph/title', true],
    ['/components/schemas/Spectrograph/properties/description/example', false],
    ['/components/schemas/Spectrograph/properties/description/description', true],
    ['/components/securitySchemes/OAuth/flows/implicit/scopes/observe', false],
    [
        '/paths/~1stations~1polar/post/callbacks/afterObservation/{$request.body#~1url}/post/summary',
        true,
    ],
    [
        '/paths/~1stations~1polar/get/responses/200/content/application~1json/examples/clearSky/summary',
        true,
    ],
    [
        '/paths/~1stations~1polar/get/responses/200/content/application~1json/examples/clearSky/value/description',
        false,
    ],
    [
        '/paths/~1stations~1polar/get/responses/200/content/application~1json/example/description',
        false,
    ],
    ['', false],
])('only classifies schema-defined annotation pointers (%s)', (path, expected) => {
    expect(isTextPointer(path)).toBe(expected);
});

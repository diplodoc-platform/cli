import type * as Path from 'node:path';
import type {Run} from '~/commands/build';

import {describe, expect, it, vi} from 'vitest';

import {ExternalSearchProvider} from './index';

vi.mock('node:path', async (importOriginal) => {
    const path = await importOriginal<typeof Path>();
    return {...path, join: path.win32.join};
});

describe('external search on Windows', () => {
    it('publishes URL paths with forward slashes', () => {
        const run = {config: {search: {endpoint: '/query'}}} as Run;
        const provider = new ExternalSearchProvider(run);
        expect(provider.config('ru').link).toBe('_search/ru/index.html');
    });
});

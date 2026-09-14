import {vi} from 'vitest';

// Git hooks expose their temporary commit index to child processes.
// Unit tests create isolated repositories and must not mutate that index.
delete process.env.GIT_INDEX_FILE;

vi.mock('@diplodoc/page-constructor-extension/renderer', () => ({
    createServerPageConstructorContent: vi.fn(() => ''),
    default: {},
}));

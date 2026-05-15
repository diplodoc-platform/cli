import {vi} from 'vitest';

vi.mock('@diplodoc/page-constructor-extension/renderer', () => ({
    createServerPageConstructorContent: () => '',
    default: {},
}));

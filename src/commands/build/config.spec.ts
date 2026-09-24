import type {BuildArgs, BuildConfig} from './types';

import {describe, expect, it} from 'vitest';

import {normalizeBaseHref, resolveAiConfig} from './config';

const config = (ai?: {openapiCompanions?: boolean | 'md'}) => ({ai}) as unknown as BuildConfig;
const args = (value?: unknown) =>
    (value === undefined ? {} : {aiOpenapiCompanions: value}) as unknown as BuildArgs;

describe('resolveAiConfig', () => {
    it('keeps the .yfm value when the CLI flag is not passed', () => {
        expect(resolveAiConfig(config({openapiCompanions: false}), args())).toEqual({
            openapiCompanions: false,
        });
        expect(resolveAiConfig(config({openapiCompanions: true}), args())).toEqual({
            openapiCompanions: true,
        });
        expect(resolveAiConfig(config({openapiCompanions: 'md'}), args())).toEqual({
            openapiCompanions: 'md',
        });
    });

    it('leaves the value undefined when neither flag nor config is set (extension applies default)', () => {
        expect(resolveAiConfig(config(), args())).toEqual({openapiCompanions: undefined});
    });

    it('lets an explicit CLI flag override the .yfm value', () => {
        // --ai-openapi-companions over `false`
        expect(resolveAiConfig(config({openapiCompanions: false}), args(true))).toEqual({
            openapiCompanions: true,
        });
        // --no-ai-openapi-companions over `true`
        expect(resolveAiConfig(config({openapiCompanions: true}), args(false))).toEqual({
            openapiCompanions: false,
        });
        // --no-ai-openapi-companions over `'md'`
        expect(resolveAiConfig(config({openapiCompanions: 'md'}), args(false))).toEqual({
            openapiCompanions: false,
        });
    });
});

describe('normalizeBaseHref', () => {
    it('returns undefined for a missing or empty value', () => {
        expect(normalizeBaseHref(undefined)).toBeUndefined();
        expect(normalizeBaseHref(null)).toBeUndefined();
        expect(normalizeBaseHref('')).toBeUndefined();
    });

    it('appends a trailing slash when missing', () => {
        expect(normalizeBaseHref('https://example.com/docs')).toBe('https://example.com/docs/');
    });

    it('preserves an existing trailing slash', () => {
        expect(normalizeBaseHref('https://example.com/docs/')).toBe('https://example.com/docs/');
    });
});

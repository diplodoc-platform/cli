import type {ContentConfig} from './types';

import {join, resolve} from 'node:path';
import {describe, expect, it} from 'vitest';

import {configPath} from '~/core/config';

import {resolveContentConfig} from './config-resolve';

const MOCK = resolve(__dirname, '../../../tests/mocks/content');
const INDEX = join(MOCK, 'index.md') as AbsolutePath;
const CONFIG = join(MOCK, '.yfm') as AbsolutePath;

function make(overrides: Record<string | symbol, unknown> = {}) {
    return {
        input: INDEX,
        output: undefined,
        [configPath]: null,
        ...overrides,
    } as unknown as ContentConfig;
}

describe('resolveContentConfig', () => {
    it('uses the provided cwd as the project root when no config is given', () => {
        const config = resolveContentConfig(make(), MOCK);

        expect(config.file).toEqual('index.md');
        expect(config.input).toEqual(MOCK);
        expect(config.output).toEqual(MOCK);
        expect(config.originAsInput).toEqual(true);
        expect(config.quiet).toEqual(true);
    });

    it('uses the config directory as the project root when -c is given', () => {
        const config = resolveContentConfig(make({[configPath]: CONFIG}));

        expect(config.file).toEqual('index.md');
        expect(config.input).toEqual(MOCK);
    });

    it('preserves the user output as outputFile and repurposes output as a scope', () => {
        const out = '/somewhere/out.html' as AbsolutePath;
        const config = resolveContentConfig(make({[configPath]: CONFIG, output: out}));

        expect(config.outputFile).toEqual(out);
        expect(config.output).toEqual(MOCK);
    });

    it('falls back to the file directory when the file is outside the config root', () => {
        const config = resolveContentConfig(
            make({[configPath]: '/elsewhere/.yfm' as AbsolutePath}),
        );

        expect(config.file).toEqual('index.md');
        expect(config.input).toEqual(MOCK);
    });

    it('resolves a relative input against the provided cwd', () => {
        const config = resolveContentConfig(
            make({input: 'index.md' as AbsolutePath, [configPath]: CONFIG}),
            MOCK,
        );

        expect(config.file).toEqual('index.md');
    });

    it('throws when the input is missing or not a file', () => {
        expect(() => resolveContentConfig(make({input: MOCK as AbsolutePath}))).toThrow(
            /single input file/,
        );
        expect(() =>
            resolveContentConfig(make({input: join(MOCK, 'nope.md') as AbsolutePath})),
        ).toThrow(/single input file/);
    });

    describe('template defaults', () => {
        it('enables templating with full features by default', () => {
            const config = resolveContentConfig(make({[configPath]: CONFIG}));

            expect(config.template).toMatchObject({
                enabled: true,
                features: {substitutions: true, conditions: true, cycles: true},
            });
        });

        it('merges a partial template config from .yfm', () => {
            const config = resolveContentConfig(
                make({
                    [configPath]: CONFIG,
                    template: {features: {conditions: false}},
                }),
            );

            expect(config.template.enabled).toEqual(true);
            expect(config.template.features).toMatchObject({
                substitutions: true,
                conditions: false,
                cycles: true,
            });
        });

        it('disables templating when template is false', () => {
            const config = resolveContentConfig(make({[configPath]: CONFIG, template: false}));

            expect(config.template.enabled).toEqual(false);
        });
    });
});

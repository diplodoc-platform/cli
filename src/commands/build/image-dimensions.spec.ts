import {afterEach, describe, expect, it, vi} from 'vitest';
import transformer from '@diplodoc/transform/parser';
import {migrateImageDimensions} from '@diplodoc/transform/migrations/image-dimensions';

import {normalizePath} from '~/core/utils';

import {setupRun} from './__tests__';
import {getBaseMdItPlugins} from './features/output-html/utils';
import {configureTransform} from './transform-configuration';

afterEach(() => vi.restoreAllMocks());

function configuration() {
    const run = setupRun({
        langs: ['en'],
        idGenerator: 'constant',
        allowHtml: true,
        sanitizeHtml: true,
        content: {maxInlineSvgSize: 1024},
    });
    vi.spyOn(run.markdown, 'plugins', 'get').mockReturnValue(getBaseMdItPlugins());

    return {run, options: run['transformConfig'](normalizePath('en/images.md'), {})};
}

describe('image dimensions through the actual CLI parser configuration', () => {
    it.each([undefined, false, true])('preserves an explicit attrs setting: %s', (enabled) => {
        const {options} = configuration();
        const configured = configureTransform({
            ...options,
            ...(enabled === undefined ? {} : {enableMarkdownAttrs: enabled}),
        });

        expect(configured).toHaveProperty('enableMarkdownAttrs', enabled ?? true);

        const parser = transformer(configured);
        const document = parser.parseDocument('![Image](image.png){width=20 height=30}');
        const html = parser.compileDocument(document);
        expect(html).toContain('width="20"');
        expect(html).toContain('height="30"');
        expect(html).not.toContain('{width=');

        const generic = parser.parseDocument('Text {.image-attrs-probe}');
        expect(parser.compileDocument(generic).includes('class="image-attrs-probe"')).toBe(
            enabled !== false,
        );
    });

    it.each(['current', 'legacy'] as const)(
        'keeps dimensions, sanitization and document warning delivery with %s policy',
        (policy) => {
            const {run, options} = configuration();
            const source = '![**Image**](image.png "Tooltip" =20x30)';
            const migrated = migrateImageDimensions(source);
            expect(migrated.diagnostics).toEqual([]);
            const parser = transformer(
                configureTransform({
                    ...options,
                    enableMarkdownAttrs: false,
                    compatibility: {IMAGE_SIZE_LEGACY_SYNTAX: policy},
                }),
            );
            const first = parser.parseDocument(source + '\n\n' + source);
            const legacyHtml = parser.compileDocument(first);
            const warnings = vi
                .mocked(run.logger.deprecation)
                .mock.calls.filter(([message]) =>
                    String(message).includes('IMAGE_SIZE_LEGACY_SYNTAX'),
                );
            expect(warnings).toHaveLength(1);
            expect(run.logger.warn).not.toHaveBeenCalled();
            expect(warnings[0][0]).toContain('en/images.md');
            expect(warnings[0][0]).toContain('6.0.0');

            const modern = parser.parseDocument(migrated.output + '\n\n' + migrated.output);
            expect(parser.compileDocument(modern)).toBe(legacyHtml);
            expect(vi.mocked(run.logger.deprecation).mock.calls).toHaveLength(warnings.length);
            parser.parseDocument(source);
            expect(
                vi
                    .mocked(run.logger.deprecation)
                    .mock.calls.filter(([message]) =>
                        String(message).includes('IMAGE_SIZE_LEGACY_SYNTAX'),
                    ),
            ).toHaveLength(2);
        },
    );
});

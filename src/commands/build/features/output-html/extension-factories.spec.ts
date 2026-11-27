import {expect, it, vi} from 'vitest';
import transformer from '@diplodoc/transform/parser';
import {getLogger} from '@diplodoc/transform/log';

import {filterBundledExtensionAssets, getBaseMdItPlugins} from './utils';

it.each(['regular', 'radio', 'dropdown', 'accordion'])(
    'preserves %s tabs, caller IDs and nested cuts without legacy callback warnings',
    (variant) => {
        const warn = vi.fn();
        const generateID = vi.fn((prefix = '') => `${prefix}-cli-${generateID.mock.calls.length}`);
        const parser = transformer({
            plugins: getBaseMdItPlugins(),
            path: 'root.md',
            generateID,
            log: getLogger({warn, error: () => {}, info: () => {}}),
        });
        const source = [
            '{% cut "Outer" %}',
            '',
            '{% cut "Inner" %}',
            '',
            'Nested body',
            '',
            '{% endcut %}',
            '',
            '{% endcut %}',
            '',
            `{% list tabs ${variant} %}`,
            '',
            '- First',
            '',
            '  One[^a]',
            '',
            '- Second {selected}',
            '',
            '  Two',
            '',
            '{% endlist %}',
            '',
            '- [x] Done',
            '',
            '[^a]: Footnote',
            '',
            ':::cut [Colon title]',
            'Colon body.',
            ':::',
        ].join('\n');
        const document = parser.parseDocument(source);
        const html = parser.compileDocument(document);

        expect(html.match(/<details class="yfm-cut"/g)).toHaveLength(3);
        expect(html).not.toContain(':::cut [Colon title]');
        expect(html).toContain('Colon title');
        expect(html).toContain('Colon body.');
        expect(html).toContain(`data-diplodoc-variant="${variant}"`);
        expect(html).toContain('data-diplodoc-group="defaultTabsGroup-cli-1"');
        expect(html).toContain(`id="${variant}-cli-2"`);
        expect(html).toContain(`id="${variant}-cli-3"`);
        expect(generateID.mock.calls.slice(0, 3)).toEqual([
            ['defaultTabsGroup'],
            [variant],
            [variant],
        ]);
        expect(html).toMatch(/class="yfm-tab-panel active"[^>]*>\s*<p>Two<\/p>/);
        expect(html.match(/class="footnote-ref"/g)).toHaveLength(1);
        expect(html.match(/class="footnote-backref"/g)).toHaveLength(1);
        expect(html).toContain('type="checkbox"');
        expect(document.env.meta?.script).toEqual(
            expect.arrayContaining(['_assets/cut-extension.js', '_assets/tabs-extension.js']),
        );
        expect(document.env.meta?.style).toEqual(
            expect.arrayContaining(['_assets/cut-extension.css', '_assets/tabs-extension.css']),
        );
        expect(filterBundledExtensionAssets(document.env.meta ?? {})).toEqual({
            script: [],
            style: [],
        });
        expect(
            warn.mock.calls.flat().filter((message) => /LEGACY_(CUT|TABS)_CALLBACK/.test(message)),
        ).toEqual([]);
    },
);

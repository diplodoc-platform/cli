import {describe, expect, it} from 'vitest';
import MarkdownIt from 'markdown-it';
import file from '@diplodoc/transform/lib/plugins/file';

import {getBaseMdItPlugins} from './utils';

describe('output-html utils ', () => {
    describe('getBaseMdItPlugins', () => {
        it('should include file plugin in the list', () => {
            const plugins = getBaseMdItPlugins();

            expect(plugins).toContain(file);
        });

        it('should include multiple base plugins', () => {
            const plugins = getBaseMdItPlugins();

            expect(plugins.length).toBeGreaterThan(5);
        });
    });

    describe('file plugin integration', () => {
        it('should process yfm_file tokens correctly', () => {
            const md = new MarkdownIt();
            md.use(file);

            const content = '{% file src="_assets/test.yaml" name="Config" %}';
            const html = md.render(content);

            expect(html).toContain('_assets/test.yaml');
        });

        it('should handle file plugin with nested paths', () => {
            const md = new MarkdownIt();
            md.use(file);

            const content = '{% file src="_assets/docs/file.pdf" name="PDF" %}';
            const html = md.render(content);

            expect(html).toContain('_assets/docs/file.pdf');
        });
    });
});

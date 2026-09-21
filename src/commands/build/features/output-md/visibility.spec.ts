import {describe, expect, it} from 'vitest';

import {filterCollectedAudienceContent} from './visibility';

describe('filterCollectedAudienceContent', () => {
    it('preserves a reachable fallback when no audience content is removed', () => {
        const markdown = [
            '# Public',
            '',
            '{% include [shared](_includes/shared.md) %}',
            '',
            '{% included (_includes/shared.md) %}',
            'Shared fallback content.',
            '{% endincluded %}',
        ].join('\n');

        expect(filterCollectedAudienceContent(markdown, 'human').content).toBe(markdown);
    });

    it('drops a fallback include when its directive belongs to another audience', () => {
        const markdown = [
            '# Public',
            '',
            ':::visibility agent',
            '{% include [secret](_includes/secret.md) %}',
            ':::',
            '',
            '{% included (_includes/secret.md) %}',
            'Secret fallback content.',
            '{% endincluded %}',
        ].join('\n');

        const result = filterCollectedAudienceContent(markdown, 'human');

        expect(result.content).toContain('# Public');
        expect(result.content).not.toContain('secret.md');
        expect(result.content).not.toContain('Secret fallback content.');
        expect(result.audienceSpecificContent).toEqual(['agent']);
    });

    it('filters a reachable fallback and keeps only its reachable nested cache', () => {
        const markdown = [
            '{% include [public](_includes/public.md) %}',
            '{% included (_includes/public.md) %}',
            ':::visibility human',
            'Public include content.',
            '{% include [nested](nested.md) %}',
            ':::',
            ':::visibility agent',
            'Agent include content.',
            '{% include [secret](secret.md) %}',
            ':::',
            '{% endincluded %}',
            '{% included (_includes/public.md:nested.md) %}',
            'Nested public content.',
            '{% endincluded %}',
            '{% included (_includes/public.md:secret.md) %}',
            'Nested secret content.',
            '{% endincluded %}',
        ].join('\n');

        const result = filterCollectedAudienceContent(markdown, 'human');

        expect(result.content).toContain('Public include content.');
        expect(result.content).toContain('Nested public content.');
        expect(result.content).not.toContain('Agent include content.');
        expect(result.content).not.toContain('Nested secret content.');
        expect(result.content).toContain('{% included (_includes/public.md:nested.md) %}');
        expect(result.content).not.toContain('{% included (_includes/public.md:secret.md) %}');
    });
});

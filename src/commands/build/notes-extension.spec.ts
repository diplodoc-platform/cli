import {afterEach, expect, it, vi} from 'vitest';
import transform from '@diplodoc/transform';

import {normalizePath} from '~/core/utils';

import {setupRun} from './__tests__';
import {getBaseMdItPlugins} from './features/output-html/utils';

afterEach(() => vi.restoreAllMocks());

it('renders standalone notes through the actual CLI plugin list', async () => {
    const run = setupRun({
        langs: ['en'],
        idGenerator: 'constant',
        content: {maxInlineSvgSize: 1024},
    });
    vi.spyOn(run.markdown, 'plugins', 'get').mockReturnValue(getBaseMdItPlugins());
    vi.spyOn(run.markdown, 'titles').mockResolvedValue({});
    const file = normalizePath('en/notes.md');
    const warning = vi.spyOn(run.logger, 'warn');
    const [html] = await run.transform(
        file,
        '{% note info "Custom **title**" %}\n\nBody.\n\n{% endnote %}\n\n{% note warning %}\n\nWarning.\n\n{% endnote %}\n\n{% note invalid %}\n\nInvalid.\n\n{% endnote %}',
        {deps: [], assets: []},
    );
    expect(html).toContain('Custom <strong>title</strong>');
    expect(html).toContain('yfm-note');
    expect(html).toContain('Body.');
    expect(html).toContain('Warning.');
    expect(html).toContain('yfm-note-title');
    expect(warning).toHaveBeenCalledWith(expect.stringContaining('file en/notes.md'));
});

it.each([true, false])(
    'preserves notesAutotitle=%s through the CLI plugin list',
    (notesAutotitle) => {
        const {result} = transform('{% note info %}\n\nBody.\n\n{% endnote %}', {
            plugins: getBaseMdItPlugins(),
            lang: 'en',
            path: 'en/notes.md',
            notesAutotitle,
        });
        expect(result.html.includes('yfm-note-title')).toBe(notesAutotitle);
        expect(result.html).toContain('Body.');
    },
);

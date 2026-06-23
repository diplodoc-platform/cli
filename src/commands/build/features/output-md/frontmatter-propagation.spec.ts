import type {EntryGraph, EntryGraphNode} from '~/core/markdown';
import type {Meta} from '~/core/meta';

import {describe, expect, it} from 'vitest';

import {getSoleIncludeDep, isMeaningfulFrontmatter} from './frontmatter-propagation';

function makeNode(content: string, overrides: Partial<EntryGraphNode> = {}): EntryGraphNode {
    const directive = '{% include [label](_includes/with-fm.md) %}';
    const start = content.indexOf('{%');

    return {
        path: '_includes/with-fm.md' as NormalizedPath,
        link: '_includes/with-fm.md',
        match: directive,
        location: [start, start + directive.length],
        hash: null,
        search: null,
        content,
        deps: [],
        assets: [],
        ...overrides,
    } as EntryGraphNode;
}

function makeGraph(content: string, deps: EntryGraphNode[]): EntryGraph {
    return {
        path: 'main.md' as NormalizedPath,
        content,
        deps,
        assets: [],
    };
}

describe('isMeaningfulFrontmatter', () => {
    it('returns false for undefined / null', () => {
        expect(isMeaningfulFrontmatter(undefined)).toBe(false);
        expect(isMeaningfulFrontmatter(null)).toBe(false);
    });

    it('returns false for an empty object', () => {
        expect(isMeaningfulFrontmatter({} as Meta)).toBe(false);
    });

    it('returns true when at least one field is present', () => {
        expect(isMeaningfulFrontmatter({title: 'Hello'} as unknown as Meta)).toBe(true);
    });
});

describe('getSoleIncludeDep', () => {
    it('returns the dep when body is exactly one include', () => {
        const content = '{% include [label](_includes/with-fm.md) %}';
        const dep = makeNode(content, {location: [0, content.length]});

        expect(getSoleIncludeDep(makeGraph(content, [dep]))).toBe(dep);
    });

    it('treats surrounding whitespace (spaces, tabs, newlines) as empty', () => {
        const content = '\n\n  \t{% include [label](_includes/with-fm.md) %}\n  \n';
        const start = content.indexOf('{%');
        const dep = makeNode(content, {
            location: [start, start + '{% include [label](_includes/with-fm.md) %}'.length],
        });

        expect(getSoleIncludeDep(makeGraph(content, [dep]))).toBe(dep);
    });

    it('returns null when there is non-whitespace content before the include', () => {
        const content = '# Title\n\n{% include [label](_includes/with-fm.md) %}';
        const start = content.indexOf('{%');
        const dep = makeNode(content, {
            location: [start, start + '{% include [label](_includes/with-fm.md) %}'.length],
        });

        expect(getSoleIncludeDep(makeGraph(content, [dep]))).toBeNull();
    });

    it('returns null when there is non-whitespace content after the include', () => {
        const directive = '{% include [label](_includes/with-fm.md) %}';
        const content = `${directive}\n\nTrailing text.`;
        const dep = makeNode(content, {location: [0, directive.length]});

        expect(getSoleIncludeDep(makeGraph(content, [dep]))).toBeNull();
    });

    it('returns null when there are zero deps', () => {
        expect(getSoleIncludeDep(makeGraph('Just text.', []))).toBeNull();
    });

    it('returns null when there are multiple deps', () => {
        const directiveA = '{% include [a](_includes/a.md) %}';
        const directiveB = '{% include [b](_includes/b.md) %}';
        const content = `${directiveA}\n\n${directiveB}`;
        const depA = makeNode(content, {location: [0, directiveA.length]});
        const depB = makeNode(content, {
            location: [
                content.indexOf(directiveB),
                content.indexOf(directiveB) + directiveB.length,
            ],
        });

        expect(getSoleIncludeDep(makeGraph(content, [depA, depB]))).toBeNull();
    });
});

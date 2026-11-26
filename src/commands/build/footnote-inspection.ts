import type {MarkdownItPluginCb} from '@diplodoc/transform/types';
import type {TransformConfig} from './run';
import type {Token} from '~/core/markdown/parser';

import footnotes from '@diplodoc/transform/plugins/footnotes';
import transformer from '@diplodoc/transform/parser';

import {RunLogger} from '~/core/run';

import {getBaseMdItPlugins} from './features/output-html/utils';
import {configureTransform} from './transform-configuration';
import {INCLUDE_REGEXP} from './features/output-html/plugins/includes-detect';

export type PaddedIncludeParagraph = {start: number; end: number; marker: string};

export type MergeSourceInspection = {
    footnotes: boolean;
    paddedIncludeParagraphs: PaddedIncludeParagraph[];
};

/** Preserve the existing boolean inspection entry point. */
export function inspectFootnoteSyntax(source: string, config: TransformConfig): boolean {
    return inspectMergeSourceSyntax(source, config).footnotes;
}

/** Inspect canonical source grammar once in an isolated, non-rendering CLI parser. */
export function inspectMergeSourceSyntax(
    source: string,
    config: TransformConfig,
): MergeSourceInspection {
    let matched = false;
    let blockRegistered = 0;
    let inlineRegistered = 0;
    const inspect: MarkdownItPluginCb = (md, options) => {
        const block = md.block.ruler;
        const inline = md.inline.ruler;
        const before = block.before;
        const after = inline.after;
        const beforeDescriptor = Object.getOwnPropertyDescriptor(block, 'before');
        const afterDescriptor = Object.getOwnPropertyDescriptor(inline, 'after');
        block.before = (anchor, name, rule, ruleOptions) => {
            if (name !== 'footnote_def') return before.call(block, anchor, name, rule, ruleOptions);
            blockRegistered++;
            return before.call(
                block,
                anchor,
                name,
                (state, start, end, silent) => {
                    const accepted = rule(state, start, end, silent);
                    if (accepted && !silent) matched = true;
                    return accepted;
                },
                ruleOptions,
            );
        };
        inline.after = (anchor, name, rule, ruleOptions) => {
            if (name !== 'footnote_ref') return after.call(inline, anchor, name, rule, ruleOptions);
            inlineRegistered++;
            return after.call(
                inline,
                anchor,
                name,
                (state, silent) => {
                    const accepted = rule(state, silent);
                    if (accepted && !silent) matched = true;
                    return accepted;
                },
                ruleOptions,
            );
        };
        try {
            footnotes(md, options);
        } finally {
            if (beforeDescriptor) Object.defineProperty(block, 'before', beforeDescriptor);
            else Reflect.deleteProperty(block, 'before');
            if (afterDescriptor) Object.defineProperty(inline, 'after', afterDescriptor);
            else Reflect.deleteProperty(inline, 'after');
        }
    };
    // Inspection uses the CLI default grammar; custom hook plugins are intentionally excluded.
    const base = getBaseMdItPlugins();
    const plugins = base.map((plugin) => (plugin === footnotes ? inspect : plugin));
    const restrictCore: MarkdownItPluginCb = (md) => {
        md.core.ruler.enableOnly(['normalize', 'block', 'inline']);
    };
    plugins.push(restrictCore);
    const parser = transformer(
        configureTransform({
            ...config,
            plugins,
            files: {},
            titles: {},
            assets: {},
            log: new RunLogger({quiet: true}),
            generateID: () => 'footnote-inspection',
            existsInProject: () => false,
            resolveAnchorPage: () => null,
            rawContent: () => '',
        }),
    );
    if (blockRegistered !== 1 || inlineRegistered !== 1) {
        throw new Error('Expected canonical footnote source rules');
    }
    const document = parser.parseDocument(source);
    return {
        footnotes: matched,
        paddedIncludeParagraphs: indexPaddedIncludeParagraphs(source, document.tokens),
    };
}

/** Index original UTF-16 coordinates without changing native tokens or source. */
export function indexPaddedIncludeParagraphs(
    source: string,
    tokens: readonly Token[],
): PaddedIncludeParagraph[] {
    let starts: number[] | undefined;

    const paragraphs: PaddedIncludeParagraph[] = [];
    let previousEnd = 0;
    for (let i = 0; i + 2 < tokens.length; i++) {
        const open = tokens[i];
        const inline = tokens[i + 1];
        const close = tokens[i + 2];
        if (
            open.type !== 'paragraph_open' ||
            inline.type !== 'inline' ||
            close.type !== 'paragraph_close'
        ) {
            continue;
        }
        const marker = inline.content.trim();
        if (marker === inline.content || !INCLUDE_REGEXP.test(marker)) {
            continue;
        }
        starts ??= sourceLineStarts(source);
        const map = open.map;
        if (
            !map ||
            !Number.isInteger(map[0]) ||
            !Number.isInteger(map[1]) ||
            map[0] < 0 ||
            map[1] <= map[0] ||
            map[0] >= starts.length ||
            map[1] > starts.length
        ) {
            continue;
        }
        const start = starts[map[0]];
        const end = starts[map[1]] ?? source.length;
        if (start < previousEnd) {
            // Synthetic or overlapping maps cannot justify a context decision.
            while (paragraphs.length && paragraphs[paragraphs.length - 1].end > start) {
                paragraphs.pop();
            }
            previousEnd = Math.max(previousEnd, end);
            continue;
        }
        previousEnd = end;
        paragraphs.push({start, end, marker});
    }
    return paragraphs;
}

/** Require both original location containment and the exact raw marker. */
export function hasPaddedIncludeParagraph(
    paragraphs: readonly PaddedIncludeParagraph[],
    location: readonly [number, number],
    marker: string,
): boolean {
    if (
        !Number.isInteger(location[0]) ||
        !Number.isInteger(location[1]) ||
        location[0] < 0 ||
        location[1] - location[0] !== marker.length
    ) {
        return false;
    }
    let low = 0;
    let high = paragraphs.length;
    while (low < high) {
        const middle = Math.floor((low + high) / 2);
        if (paragraphs[middle].start <= location[0]) low = middle + 1;
        else high = middle;
    }
    const paragraph = paragraphs[low - 1];
    return Boolean(
        paragraph &&
            location[0] >= paragraph.start &&
            location[1] <= paragraph.end &&
            marker === paragraph.marker,
    );
}

function sourceLineStarts(source: string): number[] {
    const starts = [0];
    const newlines = /\r\n|\r|\n/g;
    let newline: RegExpExecArray | null;
    while ((newline = newlines.exec(source))) {
        starts.push(newline.index + newline[0].length);
    }
    return starts;
}

import {FRAGMENT_SEPARATOR} from '../providers/ai/prompts';

export {FRAGMENT_SEPARATOR};

/**
 * Marker of a judge request. The judge system prompt is not exported
 * from the provider on purpose; `mock.spec.ts` asserts that the real
 * prompt still contains this phrase, so a silent drift is impossible.
 */
export const JUDGE_PROMPT_MARKER = 'strict reviewer of technical documentation translations';

/**
 * User prompt for capture runs: the document context (which always
 * carries the file path) on the first line, then bare fragments.
 * With this prompt the request contains no other text, so fragments
 * can be recovered exactly.
 */
export const CAPTURE_USER_PROMPT = '{{context}}\n{{fragments}}';

export type ChatRequestMessage = {
    role: string;
    content: string;
};

/**
 * Strips volatile parts from a translation unit so that two extractions
 * of the same unit compare equal: inline element ids (`id="x-12"`) are
 * assigned from a process-global counter and differ between runs.
 */
export function normalizeUnitIds(text: string): string {
    return text.replace(/(<[xg][^>]*?)\sid="[^"]*"/g, '$1');
}

export function isJudgeRequest(messages: ChatRequestMessage[]): boolean {
    return messages.some(
        (message) => message.role === 'system' && message.content.includes(JUDGE_PROMPT_MARKER),
    );
}

/**
 * Parses a capture request built with `CAPTURE_USER_PROMPT`: the first
 * line is the document context with the file path, the rest is the
 * fragments block.
 */
export function parseCaptureRequest(userContent: string): {file: string; fragments: string[]} {
    const newline = userContent.indexOf('\n');
    const header = newline === -1 ? userContent : userContent.slice(0, newline);
    const body = newline === -1 ? '' : userContent.slice(newline + 1);

    const file = /\(file ([^)]+)\)\.$/.exec(header) || /file (.+)\.$/.exec(header);

    return {
        file: file ? file[1] : header,
        fragments: body.split(`\n${FRAGMENT_SEPARATOR}\n`),
    };
}

export type TmLookup = {
    /** Resolves a prompt fragment to its reference translation. */
    resolve(fragment: string): {text: string; hit: boolean};
};

export type TmBuildResult = {
    lookup: TmLookup;
    /** Number of paired units. */
    size: number;
    /** Files whose unit counts diverge between source and reference. */
    mismatched: string[];
};

/**
 * Builds the translation memory from two capture runs: source units
 * and reference units are paired positionally per file. Files with
 * diverging unit counts cannot be paired and are reported.
 */
export function buildTranslationMemory(
    sourceUnits: Map<string, string[]>,
    referenceUnits: Map<string, string[]>,
    stripLang: (file: string) => string,
): TmBuildResult {
    const memory = new Map<string, string>();
    const mismatched: string[] = [];

    const referenceByPage = new Map<string, string[]>();
    for (const [file, units] of referenceUnits) {
        referenceByPage.set(stripLang(file), units);
    }

    for (const [file, units] of sourceUnits) {
        const page = stripLang(file);
        const reference = referenceByPage.get(page);

        if (reference?.length !== units.length) {
            mismatched.push(
                `${page} (${units.length} source units vs ${reference ? reference.length : 'no'} reference units)`,
            );
            continue;
        }

        units.forEach((unit, index) => {
            memory.set(normalizeUnitIds(unit), reference[index]);
        });
    }

    return {lookup: makeTmLookup(memory), size: memory.size, mismatched};
}

/**
 * Lookup over the paired translation memory. Fragments are matched by
 * their id-normalized text. The first fragment of a batch is glued to
 * the prompt preamble, so on a miss the lookup retries every
 * line-start suffix of the fragment.
 */
export function makeTmLookup(memory: Map<string, string>): TmLookup {
    return {
        resolve(fragment: string) {
            const direct = memory.get(normalizeUnitIds(fragment));
            if (direct !== undefined) {
                return {text: direct, hit: true};
            }

            const lines = fragment.split('\n');
            for (let index = 1; index < lines.length; index++) {
                const tail = lines.slice(index).join('\n');
                const hit = memory.get(normalizeUnitIds(tail));
                if (hit !== undefined) {
                    return {text: hit, hit: true};
                }
            }

            // Echo the fragment: identity output is what the pipeline
            // expects for untranslatable units, and the deterministic
            // checks will surface a real miss anyway.
            return {text: fragment, hit: false};
        },
    };
}

export type TranslateResponse = {
    text: string;
    /** Fragments that had no reference translation, previews. */
    misses: string[];
};

/**
 * Blocks the default user prompt puts between the instruction and the
 * fragments. Best-effort: custom prompts may phrase these differently,
 * in which case a miss echo simply keeps more of the preamble.
 */
const PREAMBLE_BLOCKS = ['Document context: ', 'Use these required term translations:'];

/**
 * Cuts the prompt preamble off the first fragment of a batch: drops
 * everything up to and including the last line that mentions the
 * fragment separator (the default prompt quotes it in the delimiter
 * instruction), then the known context and glossary blocks. An echoed
 * preamble would otherwise smuggle an extra separator into the
 * response and break the batch on the client side.
 */
export function stripPromptPreamble(part: string): string {
    let result = part;

    const lines = result.split('\n');
    for (let index = lines.length - 1; index >= 0; index--) {
        if (lines[index].includes(FRAGMENT_SEPARATOR)) {
            result = lines
                .slice(index + 1)
                .join('\n')
                .trim();
            break;
        }
    }

    const paragraphs = result.split('\n\n');
    const isPreamble = (paragraph: string) =>
        PREAMBLE_BLOCKS.some((block) => paragraph.startsWith(block));

    let start = 0;
    while (start < paragraphs.length - 1 && isPreamble(paragraphs[start])) {
        start++;
    }

    return paragraphs.slice(start).join('\n\n').trim();
}

/**
 * Answers a translation request: splits the user prompt into fragments
 * by the exact separator line and maps each through the translation
 * memory.
 */
export function buildTranslateResponse(userContent: string, lookup: TmLookup): TranslateResponse {
    const parts = userContent.split(`\n${FRAGMENT_SEPARATOR}\n`);
    const misses: string[] = [];

    const translated = parts.map((part) => {
        const {text, hit} = lookup.resolve(part);
        if (hit) {
            return text;
        }

        const bare = stripPromptPreamble(part);
        misses.push(bare.replace(/\s+/g, ' ').trim().slice(0, 100));
        return bare;
    });

    return {text: translated.join(`\n${FRAGMENT_SEPARATOR}\n`), misses};
}

export type JudgePairInput = {
    index: number;
    source: string;
    translation: string;
};

/**
 * Parses judge request pairs from the user prompt built by
 * `buildJudgeMessages`: `[N]` on its own line, then SOURCE and
 * TRANSLATION lines.
 */
export function parseJudgePairs(userContent: string): JudgePairInput[] {
    const pairs: JudgePairInput[] = [];
    const blocks = userContent.split(/^\[(\d+)\]$/m);

    // split() yields [prefix, index, body, index, body, ...]
    for (let cursor = 1; cursor < blocks.length; cursor += 2) {
        const index = Number(blocks[cursor]);
        const body = blocks[cursor + 1] || '';

        const source = /SOURCE \([^)]*\): ([\s\S]*?)\nTRANSLATION \([^)]*\): /.exec(body);
        const translation = /\nTRANSLATION \([^)]*\): ([\s\S]*?)$/.exec(body);

        pairs.push({
            index,
            source: source ? source[1].trim() : '',
            translation: translation ? translation[1].trim() : '',
        });
    }

    return pairs;
}

/**
 * Deterministic judge scoring for mock runs:
 * - the exact reference translation scores 100;
 * - an identity echo of the source scores 10;
 * - anything else is scored by token overlap with the reference (50..95)
 *   or a flat 75 when the reference is unknown.
 */
export function scoreJudgePair(
    pair: JudgePairInput,
    lookup: TmLookup,
): {score: number; issue: string} {
    const reference = lookup.resolve(pair.source);

    if (reference.hit && pair.translation === reference.text) {
        return {score: 100, issue: ''};
    }

    if (pair.translation === pair.source) {
        return {score: 10, issue: 'translation is identical to the source'};
    }

    if (!reference.hit) {
        return {score: 75, issue: 'no reference translation for this unit'};
    }

    const overlap = tokenOverlap(pair.translation, reference.text);
    return {
        score: Math.round(50 + overlap * 45),
        issue: 'differs from the reference translation',
    };
}

function tokenOverlap(left: string, right: string): number {
    const tokensLeft = new Set(
        left
            .toLowerCase()
            .split(/[^\p{L}\p{N}]+/u)
            .filter(Boolean),
    );
    const tokensRight = new Set(
        right
            .toLowerCase()
            .split(/[^\p{L}\p{N}]+/u)
            .filter(Boolean),
    );

    if (!tokensLeft.size || !tokensRight.size) {
        return 0;
    }

    let shared = 0;
    for (const token of tokensLeft) {
        if (tokensRight.has(token)) {
            shared++;
        }
    }

    return shared / Math.max(tokensLeft.size, tokensRight.size);
}

/**
 * Answers a judge request with the JSON array shape that
 * `parseJudgeResponse` expects.
 */
export function buildJudgeResponse(userContent: string, lookup: TmLookup): string {
    const pairs = parseJudgePairs(userContent);
    return JSON.stringify(
        pairs.map((pair) => ({index: pair.index, ...scoreJudgePair(pair, lookup)})),
    );
}

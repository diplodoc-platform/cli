export type CodeDirective = {
    path: string;
    lang: string;
    lines?: string;
    keepIndents: boolean;
};

export type ParseResult =
    | {passthrough: true}
    | {
          passthrough: false;
          directive?: CodeDirective;
          error?: string;
          warnings: string[];
      };

type Token = {type: 'argument'; value: string} | {type: 'attribute'; name: string; value?: string};

const ATTRIBUTE_NAMES = new Set(['lang', 'lines', 'keep-indents', 'jsonpath']);

export function parseCodeDirective(source: string): ParseResult {
    const match = /^\{%\s*code(?:\s+([\s\S]*?))?\s*%\}$/.exec(source);

    if (!match) {
        return {passthrough: false, error: 'invalid code directive syntax', warnings: []};
    }

    const tokenized = tokenize(match[1] || '');
    const hasJsonpath = tokenized.tokens.some(
        (token) => token.type === 'attribute' && token.name === 'jsonpath',
    );

    // jsonpath is still handled by the internal plugin. It must receive the
    // original directive, including unsupported arguments and formatting.
    if (hasJsonpath) {
        return {passthrough: true};
    }

    if (tokenized.error) {
        return {passthrough: false, error: tokenized.error, warnings: []};
    }

    const {attributes, positional, warnings} = collectArguments(tokenized.tokens);

    if (positional.length === 0 || !positional[0]) {
        return {passthrough: false, error: 'source path is required', warnings};
    }

    if (positional.length > 1) {
        warnings.push('extra positional arguments were ignored');
    }

    const lang = attributes.get('lang') || '';
    const lines = attributes.get('lines');

    if (attributes.has('lang') && attributes.get('lang') === undefined) {
        return {passthrough: false, error: 'attribute "lang" requires a value', warnings};
    }
    if (attributes.has('lines') && lines === undefined) {
        return {passthrough: false, error: 'attribute "lines" requires a value', warnings};
    }
    if (/[`\r\n]/.test(lang)) {
        return {passthrough: false, error: 'attribute "lang" contains unsafe characters', warnings};
    }
    if (/[\r\n]/.test(positional[0]) || (lines !== undefined && /[\r\n]/.test(lines))) {
        return {passthrough: false, error: 'directive values must fit on one line', warnings};
    }

    return {
        passthrough: false,
        warnings,
        directive: {
            path: positional[0],
            lang,
            lines,
            keepIndents: attributes.has('keep-indents'),
        },
    };
}

function collectArguments(tokens: Token[]) {
    const warnings: string[] = [];
    const positional: string[] = [];
    const attributes = new Map<string, string | undefined>();

    for (const token of tokens) {
        if (token.type === 'argument') {
            positional.push(token.value);
            continue;
        }

        if (!ATTRIBUTE_NAMES.has(token.name)) {
            warnings.push(`unexpected attribute "${token.name}" was ignored`);
            continue;
        }

        if (attributes.has(token.name)) {
            warnings.push(`duplicate attribute "${token.name}" uses its last value`);
        }
        attributes.set(token.name, token.value);
    }

    return {attributes, positional, warnings};
}

function tokenize(source: string): {tokens: Token[]; error?: string} {
    const tokens: Token[] = [];
    let offset = 0;

    while (offset < source.length) {
        offset = skipWhitespace(source, offset);
        if (offset >= source.length) {
            break;
        }

        if (isQuote(source[offset])) {
            const quoted = readQuoted(source, offset);
            if (quoted.error) {
                return {tokens, error: quoted.error};
            }
            tokens.push({type: 'argument', value: quoted.value});
            offset = quoted.offset;
            continue;
        }

        const start = offset;
        while (offset < source.length && !/\s|=/.test(source[offset])) {
            offset++;
        }
        const word = source.slice(start, offset);

        if (!word) {
            return {tokens, error: `unexpected token at offset ${offset + 1}`};
        }

        const afterWord = skipWhitespace(source, offset);
        if (source[afterWord] === '=') {
            offset = skipWhitespace(source, afterWord + 1);
            if (offset >= source.length) {
                tokens.push({type: 'attribute', name: word});
                continue;
            }

            if (isQuote(source[offset])) {
                const quoted = readQuoted(source, offset);
                if (quoted.error) {
                    return {tokens, error: quoted.error};
                }
                tokens.push({type: 'attribute', name: word, value: quoted.value});
                offset = quoted.offset;
            } else {
                const valueStart = offset;
                while (offset < source.length && !/\s/.test(source[offset])) {
                    offset++;
                }
                tokens.push({
                    type: 'attribute',
                    name: word,
                    value: source.slice(valueStart, offset),
                });
            }
            continue;
        }

        offset = afterWord;
        if (word === 'keep-indents' || word === 'jsonpath') {
            tokens.push({type: 'attribute', name: word});
        } else if (ATTRIBUTE_NAMES.has(word)) {
            tokens.push({type: 'attribute', name: word});
        } else {
            tokens.push({type: 'argument', value: word});
        }
    }

    return {tokens};
}

function skipWhitespace(source: string, offset: number) {
    while (offset < source.length && /\s/.test(source[offset])) {
        offset++;
    }
    return offset;
}

function isQuote(character: string | undefined): character is '"' | "'" {
    return character === '"' || character === "'";
}

function readQuoted(
    source: string,
    offset: number,
): {value: string; offset: number; error?: string} {
    const quote = source[offset];
    let value = '';
    offset++;

    while (offset < source.length) {
        const character = source[offset];
        if (character === quote) {
            return {value, offset: offset + 1};
        }
        if (character === '\\' && source[offset + 1] === quote) {
            value += quote;
            offset += 2;
            continue;
        }
        value += character;
        offset++;
    }

    return {value, offset, error: 'unterminated quoted value'};
}

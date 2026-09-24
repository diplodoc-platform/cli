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
    const argumentsSource = getDirectiveArguments(source);

    if (argumentsSource === undefined) {
        return {passthrough: false, error: 'invalid code directive syntax', warnings: []};
    }

    const tokenized = tokenize(argumentsSource);
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

function getDirectiveArguments(source: string): string | undefined {
    if (!source.startsWith('{%') || !source.endsWith('%}')) {
        return undefined;
    }

    const body = source.slice(2, -2).trimStart();
    if (!body.startsWith('code')) {
        return undefined;
    }

    const argumentsSource = body.slice(4);
    if (argumentsSource && !/\s/.test(argumentsSource[0])) {
        return undefined;
    }

    return argumentsSource;
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
    let offset = skipWhitespace(source, 0);

    while (offset < source.length) {
        const result = readToken(source, offset);
        if ('error' in result) {
            return {tokens, error: result.error};
        }
        tokens.push(result.token);
        offset = skipWhitespace(source, result.offset);
    }

    return {tokens};
}

type TokenResult = {token: Token; offset: number} | {error: string};

function readToken(source: string, offset: number): TokenResult {
    if (isQuote(source[offset])) {
        const quoted = readQuoted(source, offset);
        return quoted.error
            ? {error: quoted.error}
            : {token: {type: 'argument', value: quoted.value}, offset: quoted.offset};
    }

    const start = offset;
    while (offset < source.length && !/\s|=/.test(source[offset])) {
        offset++;
    }
    const word = source.slice(start, offset);
    if (!word) {
        return {error: `unexpected token at offset ${offset + 1}`};
    }

    const afterWord = skipWhitespace(source, offset);
    if (source[afterWord] === '=') {
        return readAttributeValue(source, word, afterWord + 1);
    }

    const token: Token = ATTRIBUTE_NAMES.has(word)
        ? {type: 'attribute', name: word}
        : {type: 'argument', value: word};
    return {token, offset: afterWord};
}

function readAttributeValue(source: string, name: string, start: number): TokenResult {
    let offset = skipWhitespace(source, start);
    if (offset >= source.length) {
        return {token: {type: 'attribute', name}, offset};
    }

    if (isQuote(source[offset])) {
        const quoted = readQuoted(source, offset);
        return quoted.error
            ? {error: quoted.error}
            : {token: {type: 'attribute', name, value: quoted.value}, offset: quoted.offset};
    }

    const valueStart = offset;
    while (offset < source.length && !/\s/.test(source[offset])) {
        offset++;
    }
    return {token: {type: 'attribute', name, value: source.slice(valueStart, offset)}, offset};
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

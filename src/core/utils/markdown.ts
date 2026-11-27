import type {Token} from 'markdown-it';

type TokenWalker<T> = (
    token: T,
    state: {commented: boolean; index: number},
) => void | undefined | {skip: number};

export function filterTokens<T extends {type: string; content: string}>(
    tokens: T[],
    type: string,
    handler: TokenWalker<T>,
) {
    let commented = false;

    if (!tokens || !tokens.length) {
        return;
    }

    for (let index = 0; index < tokens.length; index++) {
        const token = tokens[index];

        if (token.type === 'html_block') {
            const commentStart = token.content.match('<!--');
            const commentEnd = token.content.match('-->');

            if (commentStart && !commentEnd) {
                commented = true;
            }

            if (!commentStart && commentEnd) {
                commented = false;
            }
        }

        if (token.type === type) {
            const result = handler(token, {commented, index});
            if (result && typeof result.skip === 'number') {
                index += result.skip - 1;
            }
        }
    }
}

export function getHrefTokenAttr(token: Token) {
    const href = String(token.attrGet('href') ?? '');
    try {
        return decodeURI(href);
    } catch {}

    return href;
}

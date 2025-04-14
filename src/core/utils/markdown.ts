import type Token from 'markdown-it/lib/token';

type TokenWalker = (
    token: Token,
    state: {commented: boolean; index: number},
) => void | undefined | {skip: number};

export function filterTokens(tokens: Token[], type: string, handler: TokenWalker) {
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
            if (result?.skip) {
                index += result?.skip - 1;
            }
        }
    }
}

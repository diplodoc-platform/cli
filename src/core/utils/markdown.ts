import type Token from 'markdown-it/lib/token';

export function parseHeading(content: string) {
    const anchors = [];
    const commonHeading = content.match(/^#+/);
    const alternateHeading = content[content.length - 1];
    const alternaleLevels = ['-', '='];
    const level = commonHeading
        ? commonHeading[0].length
        : alternaleLevels.indexOf(alternateHeading) + 1;

    if (commonHeading) {
        content = content.replace(/^#+\s*/, '');
    } else {
        content = content.replace(/\n[-=]+$/, '');
    }

    const ANCHOR = /{(#[^}]+)}/g;

    let match;
    // eslint-disable-next-line no-cond-assign
    while ((match = ANCHOR.exec(content))) {
        anchors.push(match[1]);
        content = content.replace(match[0], '');
        ANCHOR.lastIndex -= match[0].length;
    }

    const title = content.trim();

    return {anchors, title, level};
}

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
                index += result?.skip;
            }
        }
    }
}

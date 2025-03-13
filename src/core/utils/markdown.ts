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

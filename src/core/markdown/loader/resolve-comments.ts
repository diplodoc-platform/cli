import type {LoaderContext} from '../loader';

export function resolveComments(this: LoaderContext, content: string) {
    const COMMENTS_CONTENTS = /<!-{2,}[\s\S]*?-{2,}>/g;
    const comments = [];

    let match;
    // eslint-disable-next-line no-cond-assign
    while ((match = COMMENTS_CONTENTS.exec(content))) {
        comments.push([match.index, COMMENTS_CONTENTS.lastIndex] as [number, number]);
    }

    this.api.comments.set(comments);

    return content;
}

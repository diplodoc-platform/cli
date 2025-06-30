import type {LoaderContext} from '../loader';

export function resolveNoTranslate(this: LoaderContext, content: string) {
    if (this.mode === 'translate') {
        return content;
    }

    content = resolveContainerDirectives(content);

    content = resolveLeafBlockDirectives(content);

    content = resolveInlineDirectives(content);

    return content;
}

function resolveContainerDirectives(content: string): string {
    const containerRegex = /:::\s*no-translate\s*\n([\s\S]*?)\n\s*:::/g;

    return content.replace(containerRegex, (_, innerContent) => {
        return innerContent;
    });
}

function resolveLeafBlockDirectives(content: string): string {
    const blockRegex = /::\s*no-translate\s*\[([\s\S]*?)\]/g;

    return content.replace(blockRegex, (_, innerContent) => {
        return innerContent;
    });
}

function resolveInlineDirectives(content: string): string {
    const inlineRegex = /(?<![:]):no-translate\s*\[([\s\S]*?)\]/g;

    return content.replace(inlineRegex, (_, innerContent) => {
        return innerContent;
    });
}

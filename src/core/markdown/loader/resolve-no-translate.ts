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
    const lines = content.split('\n');
    const result = [];

    const stack = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        if (line.trim().startsWith(':::')) {
            const directiveLine = line.trim();

            if (directiveLine === ':::') {
                if (stack.length > 0) {
                    const lastDirective = stack.pop();

                    if (lastDirective === 'no-translate' && stack.length === 0) {
                        continue;
                    }

                    result.push(line);
                }
            } else {
                const directiveMatch = directiveLine.match(/^:::\s*([^\s]+)/);
                const directiveName = directiveMatch ? directiveMatch[1] : '';

                if (directiveName === 'no-translate') {
                    stack.push('no-translate');
                    continue;
                } else {
                    stack.push(directiveName);
                    result.push(line);
                }
            }
        } else {
            result.push(line);
        }
    }

    return result.join('\n');
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

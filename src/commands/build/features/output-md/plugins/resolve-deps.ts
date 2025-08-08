import {HashedGraphNode, Sheduler, StepContext, StepFunction, signlink} from '../utils';
import {replaceAll} from '~/core/utils';

import {Run} from '../../..';

function rehashInclude(include: HashedGraphNode) {
    return replaceAll(include.match, include.link, signlink(include.link, include.hash));
}

function addIndent(content: string, numSpaces: number, skipFirstLine = false): string {
    if (!content || numSpaces <= 0) {
        return content;
    }

    const indent = ' '.repeat(numSpaces);
    // Разбиваем строку, сохраняя разделители
    const parts = content.split(/(\r\n|\r|\n)/);

    let isFirstTextLine = true;
    const result: string[] = [];
    for (let i = 0; i < parts.length; i++) {
        const part = parts[i];

        // Если это окончание строки, просто добавляем его
        if (part === '\r\n' || part === '\n' || part === '\r') {
            result.push(part);
            continue;
        }
        // Если это первая текстовая строка и нужно пропустить
        if (isFirstTextLine && skipFirstLine) {
            isFirstTextLine = false;
            result.push(part);
            continue;
        }
        isFirstTextLine = false;
        // Добавляем отступ только к непустым строкам
        result.push(part ? indent + part : part);
    }
    return result.join('');
}

export function rehashIncludes(
    _run: Run,
    deps: HashedGraphNode[],
    mergeIncludes: boolean,
): StepFunction {
    return async function (sheduler: Sheduler): Promise<void> {
        const actor = async (content: string, {dep}: StepContext): Promise<string> => {
            let result = content;
            const {location, content: depContent, indent} = dep as HashedGraphNode;

            if (mergeIncludes) {
                result =
                    result.slice(0, location[0]) +
                    addIndent(depContent, indent, true) +
                    result.slice(location[1]);
            } else {
                const rehashed = rehashInclude(dep as HashedGraphNode);
                result = result.slice(0, location[0]) + rehashed + result.slice(location[1]);
            }

            return result;
        };

        for (const dep of deps) {
            sheduler.add(dep.location, actor, {dep});
        }
    };
}

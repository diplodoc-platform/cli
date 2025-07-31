import path from 'node:path';
import fs from 'fs';
import {VarsService} from '~/core/vars/VarsService';

export async function processIncludes(
    content: string | null,
    filePath: AbsolutePath,
    vars: VarsService,
    rootDir: AbsolutePath,
    baseDir = path.dirname(filePath),
    depth = 0,
    fileCache = new Map(),
): Promise<string> {
    // Защита от бесконечной рекурсии
    if (depth > 20) {
        throw new Error(`Превышена максимальная глубина вложенности: ${filePath}`);
    }

    // Чтение файла с кэшированием
    if (!content) {
        if (fileCache.has(filePath)) {
            content = fileCache.get(filePath);
        } else {
            content = await fs.promises.readFile(filePath, 'utf8');
            fileCache.set(filePath, content);
        }
    }

    // Вычисляем ключ для текущей директории
    const currentDirKey = path.relative(rootDir, path.dirname(filePath)) || '.';

    // Обработка переменных для текущего файла
    content = replaceVariables(content || '', currentDirKey as RelativePath, vars);

    // Регулярное выражение для include
    const includeRegex = /{%\s*include\s*(notitle)?\s*\[([^\]]*)\]\s*\(([^)\s#]+)(#\S*)?\)\s*%}/g;

    // Обработка всех include
    let result = content;
    let lastIndex = result.length;

    // eslint-disable-next-line no-constant-condition
    while (true) {
        const matches = [];
        let match;

        // Находим все совпадения в текущей версии контента
        while ((match = includeRegex.exec(result)) !== null) {
            matches.push({
                fullMatch: match[0],
                notitle: Boolean(match[1]),
                description: match[2],
                filePath: match[3],
                anchor: match[4] ? match[4].substring(1) : null,
                index: match.index,
            });
        }

        // Если совпадений нет - выходим
        if (matches.length === 0) {
            break;
        }

        // Обрабатываем с конца файла
        for (let i = matches.length - 1; i >= 0; i--) {
            const {fullMatch, notitle, filePath: relPath, anchor, index} = matches[i];
            const includePath = path.resolve(baseDir, relPath);

            try {
                // Рекурсивная обработка вложенного файла
                const includedContent = await processIncludes(
                    null,
                    includePath,
                    vars,
                    rootDir,
                    path.dirname(includePath),
                    depth + 1,
                    fileCache,
                );

                let contentToInsert;

                // Обработка для notitle без anchor
                if (notitle && !anchor) {
                    contentToInsert = removeFirstHeading(includedContent);
                }
                // Обработка для случаев с anchor
                else if (anchor) {
                    contentToInsert = extractSectionByAnchor(includedContent, anchor, notitle);
                }
                // Обычный случай - весь файл
                else {
                    contentToInsert = includedContent;
                }

                // Корректировка относительных ссылок
                contentToInsert = adjustRelativeLinks(
                    contentToInsert,
                    baseDir,
                    path.dirname(includePath),
                );

                // Замена include на содержимое файла
                result =
                    result.substring(0, index) +
                    contentToInsert +
                    result.substring(index + fullMatch.length);
            } catch (error: any) {
                const errorMsg = `<!-- ERROR: ${error.message.replace('-->', '--&gt;')} -->`;
                result =
                    result.substring(0, index) +
                    errorMsg +
                    fullMatch +
                    result.substring(index + fullMatch.length);
            }
        }

        // Проверяем, не появились ли новые include после замены
        const newMatch = includeRegex.exec(result);
        if (!newMatch || newMatch.index >= lastIndex) {
            break;
        }
        lastIndex = newMatch.index;
    }

    return result;
}

function replaceVariables(content: string, currentDirKey: RelativePath, vars: VarsService): string {
    // Регулярное выражение для поиска переменных
    const varRegex = /\{\{\s*([\w.]+)\s*\}\}/g;

    const preset = vars.for(currentDirKey as RelativePath);
    return content.replace(varRegex, (_match, varName): string => preset[varName] || varName);
}

function removeFirstHeading(content: string): string {
    const lines = content.split('\n');

    // Ищем первый заголовок
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].trim().startsWith('#')) {
            // Удаляем заголовок и следующую пустую строку (если есть)
            const newLines = [...lines];
            newLines.splice(i, 1);
            if (i < newLines.length && newLines[i].trim() === '') {
                newLines.splice(i, 1);
            }
            return newLines.join('\n');
        }
    }

    // Если заголовок не найден - возвращаем исходный контент
    return content;
}

function extractSectionByAnchor(content: string, anchor: string, excludeTitle = false): string {
    const lines = content.split('\n');
    let inSection = false;
    let sectionLevel = 0;
    const sectionLines = [];
    let headerFound = false;

    for (const line of lines) {
        // Проверка на заголовок
        if (!inSection && line.trim().startsWith('#')) {
            const match = line.match(/^(#+)\s*(.*?)\s*(\{\s*#([\w-]+)\s*}\s*)?$/);
            if (match) {
                const [, hashes, title, , id] = match;
                const level = hashes.length;

                // Проверяем совпадение по anchor
                if (id === anchor || title.trim() === anchor) {
                    inSection = true;
                    sectionLevel = level;
                    headerFound = true;

                    // Пропускаем заголовок, если нужно
                    if (!excludeTitle) {
                        sectionLines.push(line);
                    }
                    continue;
                }
            }
        }

        // Если внутри секции
        if (inSection) {
            // Проверка на следующий заголовок того же или высшего уровня
            if (line.trim().startsWith('#')) {
                const match = line.match(/^(#+)/);
                if (match && match[1].length <= sectionLevel) {
                    break; // Конец секции
                }
            }

            sectionLines.push(line);
        }
    }

    if (!headerFound) {
        return `<!-- Section "${anchor}" not found -->`;
    }

    return sectionLines.join('\n').trim();
}

function adjustRelativeLinks(content: string, newBaseDir: string, originalBaseDir: string): string {
    return content.replace(/!?\[([^\]]*)\]\(([^)\s]+)\)/g, (match, _text, url) => {
        // Пропускаем абсолютные ссылки, якоря и data-URI
        if (/^(?:[a-z]+:|\/|#|data:)/i.test(url)) {
            return match;
        }

        // Преобразуем относительные пути
        const absolutePath = path.resolve(originalBaseDir, url);
        const relativePath = path.relative(newBaseDir, absolutePath);

        // Нормализация для URL
        const newUrl = relativePath.split(path.sep).join('/');

        return match.replace(url, newUrl);
    });
}

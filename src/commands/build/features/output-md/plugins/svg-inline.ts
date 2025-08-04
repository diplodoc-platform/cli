import fs from 'fs';
import path from 'node:path';
import {optimize} from 'svgo';

function prefix() {
    const value = Math.floor(Math.random() * 1e9);

    return 'rnd-' + value.toString(16);
}

export async function inlineSVGImages(markdown: string, baseDir: string) {
    // Этап 1: Сбор reference-определений
    const refDefs: Hash<Hash<string>> = {};
    const refRegex = /^\[([^\]]+)\]:\s*(\S+)(?:\s+(["'])(.*?)\3)?(?:\s*=\s*(\d+)?x(\d+)?)?\s*$/gm;

    let refMatch;
    while ((refMatch = refRegex.exec(markdown)) !== null) {
        const [_full, refId, src, _quote, title, width, height] = refMatch;
        refDefs[refId.toLowerCase()] = {src, title, width, height};
    }

    // Этап 2: Замена reference-style изображений
    markdown = markdown.replace(/!\[([^\]]*)\]\[([^\]]+)\]/g, (match, alt, refId) => {
        const def = refDefs[refId.toLowerCase()];
        if (!def) {
            return match;
        }

        let replacement = `![${alt}](${def.src}`;
        if (def.title) {
            replacement += ` "${def.title}"`;
        }
        if (def.width || def.height) {
            replacement += ` =${def.width || ''}x${def.height || ''}`;
        }
        return replacement + ')';
    });

    // Этап 3: Обработка прямых изображений и изображений-ссылок
    // Улучшенное регулярное выражение для всех типов изображений
    const imgRegex =
        /(\[?)(!\[([^\]]*)\]\(([^)\s]+)(?:\s+(["'])(.*?)\5)?(?:\s*=\s*(\d+)?x(\d+)?)?\))(\]?)(?:\(([^)]+)\))?/g;

    // Обработка с конца файла
    let lastIndex = markdown.length;
    let result = markdown;

    // eslint-disable-next-line no-constant-condition
    while (true) {
        const matches = [];
        let match;

        while ((match = imgRegex.exec(result)) !== null) {
            matches.push({
                fullMatch: match[0],
                isLinkStart: match[1] === '[',
                imgPart: match[2],
                alt: match[3],
                src: match[4],
                quote: match[5],
                title: match[6],
                width: match[7],
                height: match[8],
                isLinkEnd: match[9] === ']',
                linkUrl: match[10],
                index: match.index,
            });
        }

        if (matches.length === 0) {
            break;
        }

        for (let i = matches.length - 1; i >= 0; i--) {
            const {
                fullMatch,
                isLinkStart,
                alt,
                src,
                title,
                width,
                height,
                isLinkEnd,
                linkUrl,
                index,
            } = matches[i];

            // Пропускаем не-SVG изображения
            if (!src.toLowerCase().endsWith('.svg')) {
                continue;
            }

            try {
                // Полный путь к файлу SVG
                const imgPath = path.resolve(baseDir, src);
                let svgContent = await fs.promises.readFile(imgPath, 'utf8');

                // Оптимизация SVG с префиксом для ID
                svgContent = optimize(svgContent, {
                    plugins: [
                        {
                            name: 'prefixIds',
                            params: {
                                prefix: prefix(),
                                prefixClassNames: false,
                            },
                        },
                    ],
                }).data;

                // Добавляем атрибуты ширины/высоты
                if (width || height) {
                    const sizeAttrs = [];
                    if (width) {
                        sizeAttrs.push(`width="${width}"`);
                    }
                    if (height) {
                        sizeAttrs.push(`height="${height}"`);
                    }

                    svgContent = svgContent.replace(
                        /<svg([^>]*)>/,
                        `<svg$1 ${sizeAttrs.join(' ')}>`,
                    );
                }

                // Добавляем заголовок как комментарий
                if (title) {
                    svgContent += `\n<!-- ${title} -->`;
                }

                // Добавляем альтернативный текст как aria-label
                if (alt) {
                    svgContent = svgContent.replace(
                        /<svg([^>]*)>/,
                        `<svg$1 aria-label="${alt.replace(/"/g, '&quot;')}">`,
                    );
                }

                // Формируем замену с учетом типа изображения
                let replacement = svgContent;

                // Если изображение внутри ссылки
                if (isLinkStart && isLinkEnd && linkUrl) {
                    // replacement = `[${svgContent}](${linkUrl})`;
                    replacement = `<a href="${linkUrl}">${svgContent}</a>`;
                }

                // Заменяем изображение на инлайн SVG
                result =
                    result.substring(0, index) +
                    replacement +
                    result.substring(index + fullMatch.length);
            } catch (error: any) {
                // В случае ошибки оставляем оригинальное изображение
                const errorMsg = `<!-- SVG embedding error: ${error.message} -->`;
                result =
                    result.substring(0, index) +
                    errorMsg +
                    fullMatch +
                    result.substring(index + fullMatch.length);
            }
        }

        // Проверяем, не появились ли новые совпадения после замены
        const newMatch = imgRegex.exec(result);
        if (!newMatch || newMatch.index >= lastIndex) {
            break;
        }
        lastIndex = newMatch.index;
    }

    return result;
}

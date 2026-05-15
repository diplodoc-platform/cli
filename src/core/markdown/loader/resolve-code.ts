import type {LoaderContext} from '../loader';
import type Token from 'markdown-it/lib/token';

import MarkdownIt from 'markdown-it';
// @ts-ignore
import deflist from 'markdown-it-deflist';
import imsize from '@diplodoc/transform/lib/plugins/imsize';
import yfmTable from '@diplodoc/transform/lib/plugins/table';

function computeLineStarts(lines: string[]): number[] {
    const lineStarts: number[] = [0];
    for (let i = 1; i < lines.length; i++) {
        const lineEndingLength = 1; //lines[i - 1].endsWith('\r') ? 2 : 1;
        lineStarts[i] = lineStarts[i - 1] + lines[i - 1].length + lineEndingLength;
    }
    return lineStarts;
}

const lineToCharPosition = (line: number, lineStarts: number[], content: string): number =>
    line >= lineStarts.length ? content.length : lineStarts[line];

function calculateAdjustedEnd(
    endLine: number,
    lineStarts: number[],
    lines: string[],
    content: string,
): number {
    let end = content.length;
    if (endLine <= lineStarts.length) {
        end = endLine === 0 ? 0 : lineStarts[endLine - 1] + lines[endLine - 1].length;
    }
    return endLine <= lines.length && endLine > 0 ? end + 1 : end;
}

// Process block code tokens (fence and code_block)
function processBlockCode(
    token: Token,
    lineStarts: number[],
    lines: string[],
    content: string,
    codes: Array<[number, number]>,
) {
    if (!token.map || token.map.length !== 2) {
        return;
    }

    const [startLine, endLine] = token.map;

    const start = lineToCharPosition(startLine, lineStarts, content);

    let adjustedEnd: number;
    if (token.type === 'fence' && endLine <= lines.length) {
        const endLineContent = lines[endLine - 1] || '';
        const fenceEndIndex = endLineContent.indexOf(token.markup);
        if (fenceEndIndex > -1) {
            const lineStart = lineStarts[endLine - 1] || 0;
            const fenceEndPos = lineStart + fenceEndIndex + token.markup.length;
            adjustedEnd = fenceEndPos;
        } else {
            adjustedEnd = calculateAdjustedEnd(endLine, lineStarts, lines, content);
        }
    } else {
        adjustedEnd = calculateAdjustedEnd(endLine, lineStarts, lines, content);
    }

    codes.push([start, adjustedEnd]);
}

// Check specific attribute in image part
function checkAttribute(
    imagePart: string,
    matchStart: number,
    codeText: string | null,
    start: number | undefined,
    end: number | undefined,
    regex: RegExp,
    getAttrStart: (matchStart: number, imagePart: string) => number,
): boolean {
    const match = imagePart.match(regex);
    if (match) {
        if (codeText !== null) {
            // Check if code text is in attributes
            if (match[1].includes(codeText)) {
                return true;
            }
        } else if (start !== undefined && end !== undefined) {
            // Check if code range falls within attributes
            const attrStart = getAttrStart(matchStart, imagePart);
            const attrEnd = attrStart + match[0].length;
            if (start >= attrStart && end <= attrEnd) {
                return true;
            }
        }
    }
    return false;
}

// Check attributes in image part
function checkImageAttributes(
    imagePart: string,
    matchStart: number,
    codeText: string | null,
    start?: number,
    end?: number,
): {braceMatch: boolean; quoteMatch: boolean} {
    // Check attributes in curly braces {...}
    const braceMatch = checkAttribute(
        imagePart,
        matchStart,
        codeText,
        start,
        end,
        /\s*{([^}]*)}/,
        (matchStart, imagePart) => matchStart + imagePart.indexOf('{'),
    );

    // Check title attribute in quotes "..."
    const quoteMatch = checkAttribute(
        imagePart,
        matchStart,
        codeText,
        start,
        end,
        /\s*"([^"]*)"/,
        (matchStart, imagePart) => matchStart + imagePart.indexOf('"'),
    );

    return {braceMatch, quoteMatch};
}

// Add code to array and update position
function addCodeAndUpdatePosition(
    startIndex: number,
    endIndex: number,
    content: string,
    codes: Array<[number, number]>,
    parentStartPos: number,
    lines: string[],
): number {
    // Check if this code is inside image attributes
    const insideAttrs = isInsideImageAttributes(content, startIndex, endIndex, lines);
    if (!insideAttrs) {
        codes.push([startIndex, endIndex]);
    }

    // Update parentStartPos to avoid finding the same match again
    return insideAttrs ? parentStartPos : Math.max(parentStartPos, endIndex);
}

// Process inline code tokens
function processInlineCode(
    token: Token,
    content: string,
    parentStartPos: number,
    codes: Array<[number, number]>,
    lineStarts: number[],
    lines: string[],
): number {
    if (!token.markup || !token.content) {
        return parentStartPos;
    }

    // Use token's position information if available
    if (token.map && token.map.length === 2) {
        const [startLine, _endLine] = token.map;
        const start = lineToCharPosition(startLine, lineStarts, content);

        // Find the exact position of the inline code within the line
        const lineContent = lines[startLine] || '';
        const searchPattern = token.markup + token.content + token.markup;
        const patternIndex = lineContent.indexOf(searchPattern);

        if (patternIndex !== -1) {
            const startIndex = start + patternIndex;
            const endIndex = startIndex + searchPattern.length;

            return addCodeAndUpdatePosition(
                startIndex,
                endIndex,
                content,
                codes,
                parentStartPos,
                lines,
            );
        }
    } else {
        const searchPattern = token.markup + token.content + token.markup;
        const startIndex = content.indexOf(searchPattern, parentStartPos);

        if (startIndex !== -1) {
            const endIndex = startIndex + searchPattern.length;

            return addCodeAndUpdatePosition(
                startIndex,
                endIndex,
                content,
                codes,
                parentStartPos,
                lines,
            );
        }
    }

    return parentStartPos;
}

// Function to check if code is inside image attributes
function isInsideImageAttributes(
    content: string,
    start: number,
    end: number,
    lines: string[],
): boolean {
    // Limit regex search to a smaller window around the code for better performance
    const windowSize = 200; // Reduced window size for better performance
    const checkStart = Math.max(0, start - windowSize);
    const checkEnd = Math.min(content.length, end + windowSize);
    const contentWindow = content.substring(checkStart, checkEnd);

    // Only search for images in the limited window
    const imageRegex = /!\[[^\]]*\]\([^)]*\)(?:\s*"[^"]*")?(?:\s*{[^}]*})?/g;

    let match;
    while ((match = imageRegex.exec(contentWindow)) !== null) {
        // Adjust positions to global content positions
        const matchStart = match.index + checkStart;
        const matchEnd = matchStart + match[0].length;

        // Check if code range falls within this image
        if (start >= matchStart && end <= matchEnd) {
            // Check if code is in attributes
            const imagePart = match[0];
            // Adjust positions relative to the image part
            const relativeStart = start - matchStart;
            const relativeEnd = end - matchStart;
            const {braceMatch, quoteMatch} = checkImageAttributes(
                imagePart,
                matchStart,
                null,
                relativeStart,
                relativeEnd,
            );
            if (braceMatch || quoteMatch) {
                return true;
            }
        }
    }

    // Additional check: if code is in attributes of any image in the document,
    // then it should not be marked as code block
    const codeContent = content.substring(start, end);
    const codeText = codeContent.replace(/`/g, ''); // Remove backticks
    // TODO:goldserg not optimized block (increase time at 6 times)
    // Find all images in the document
    const allImagesRegex = /!\[[^\]]*\]\([^)]*\)(?:\s*"[^"]*")?(?:\s*{[^}]*})?/gs;
    let imageMatch;
    while ((imageMatch = allImagesRegex.exec(contentWindow)) !== null) {
        // Check if code is in image attributes
        const imagePart = imageMatch[0];
        const {braceMatch, quoteMatch} = checkImageAttributes(
            imagePart,
            imageMatch.index,
            codeText,
        );
        if (braceMatch || quoteMatch) {
            return true;
        }
    }

    // Additional check for YFM tables: if code is in one table cell,
    // and image in another cell of the same row, then code should not be marked as code block
    // Check if code is in YFM table context
    let lineIndex = 0;
    let charCount = 0;

    // Find the line where the code is located
    for (let i = 0; i < lines.length; i++) {
        if (charCount <= start && start < charCount + lines[i].length + 1) {
            lineIndex = i;
            break;
        }
        charCount += lines[i].length + 1;
    }

    // Check if line is in YFM table context
    if (lineIndex > 0 && lineIndex < lines.length - 1) {
        const prevLine = lines[lineIndex - 1];
        const currentLine = lines[lineIndex];
        const nextLine = lines[lineIndex + 1];

        // In YFM table, if code is in one cell and image in another,
        // then code should not be marked as code block
        // We need to check if code is in the same line as image
        if (
            prevLine.trim().startsWith('#|') &&
            nextLine.trim().startsWith('|#') &&
            currentLine.includes('![') &&
            currentLine.includes('](')
        ) {
            return true;
        }
    }

    return false;
}

// Process inline tokens that may contain inline code
function processInlineToken(
    token: Token,
    lineStarts: number[],
    content: string,
    parentStartPos: number,
): number {
    if (!token.children || token.children.length === 0) {
        return parentStartPos;
    }

    let inlineStartPos = parentStartPos;
    if (token.map && token.map.length === 2) {
        const [startLine] = token.map;
        inlineStartPos = lineToCharPosition(startLine, lineStarts, content);
    }

    return inlineStartPos;
}

export function resolveBlockCodes(this: LoaderContext, content: string) {
    if (!this.options.mergeContentParts || !content.includes('![')) {
        this.api.blockCodes.set([]);
        return content;
    }
    const md = new MarkdownIt({html: true});
    const diplodocOptions = {
        notesAutotitle: false,
        path: '',
    };

    md.use(deflist, diplodocOptions);
    md.use(imsize, diplodocOptions);
    md.use(yfmTable, diplodocOptions);

    const tokens = md.parse(content, {});

    const codes: Array<[number, number]> = [];

    const lines = content.split('\n');
    const lineStarts = computeLineStarts(lines);

    function extractCodeBlocks(
        tokens: Token[],
        parentStartPos = 0,
        parentType: string | null = null,
    ) {
        for (const token of tokens) {
            let currentParentStartPos = parentStartPos;

            if (token.type === 'fence' || token.type === 'code_block') {
                processBlockCode(token, lineStarts, lines, content, codes);
            } else if (token.type === 'inline') {
                currentParentStartPos = processInlineToken(
                    token,
                    lineStarts,
                    content,
                    currentParentStartPos,
                );
            } else if (token.type === 'code_inline') {
                // Skip code_inline tokens that are children of image tokens
                if (parentType !== 'image') {
                    currentParentStartPos = processInlineCode(
                        token,
                        content,
                        currentParentStartPos,
                        codes,
                        lineStarts,
                        lines,
                    );
                }
            }

            if (token.children && token.children.length > 0) {
                extractCodeBlocks(token.children, currentParentStartPos, token.type);
            }
        }
    }

    extractCodeBlocks(tokens);

    this.api.blockCodes.set(codes);

    return content;
}

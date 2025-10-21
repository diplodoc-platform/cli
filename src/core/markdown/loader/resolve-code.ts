import type {LoaderContext} from '../loader';
import type Token from 'markdown-it/lib/token';

import MarkdownIt from 'markdown-it';

// Precompute line start positions for accurate conversion from line numbers to character positions
function computeLineStarts(content: string): number[] {
    const lines = content.split('\n');
    const lineStarts: number[] = [0];
    for (let i = 1; i < lines.length; i++) {
        lineStarts[i] = lineStarts[i - 1] + lines[i - 1].length + 1;
    }
    return lineStarts;
}

// Convert line numbers to character positions
function lineToCharPosition(line: number, lineStarts: number[], lines: string[], content: string): number {
    if (line >= lineStarts.length) {return content.length;}
    return lineStarts[line];
}

// Process block code tokens (fence and code_block)
function processBlockCode(token: Token, lineStarts: number[], lines: string[], content: string, codes: Array<[number, number]>) {
    // Guard clause for missing map
    if (!token.map || token.map.length !== 2) {return;}
    
    const [startLine, endLine] = token.map;
    
    // Convert line numbers to character positions
    // Line numbers in markdown-it are 0-based
    const start = lineToCharPosition(startLine, lineStarts, lines, content);
    
    // For the end position, we want to include the newline at the end of the last line
    let end = content.length;
    if (endLine <= lineStarts.length) {
        end = endLine === 0 ? 0 : lineStarts[endLine - 1] + lines[endLine - 1].length;
    }
    
    // Adjust for the newline character at the end of the code block
    const adjustedEnd = endLine <= lines.length && endLine > 0 ? end + 1 : end;
    
    codes.push([start, adjustedEnd]);
}

// Process inline code tokens
function processInlineCode(token: Token, content: string, parentStartPos: number, codes: Array<[number, number]>): number {
    // Guard clause for missing markup or content
    if (!token.markup || !token.content) {return parentStartPos;}
    
    // For inline code, we need to search for it in the content
    // We search for the markup + content + markup pattern
    // We start searching from the parent's start position to avoid finding wrong matches
    const searchPattern = token.markup + token.content + token.markup;
    const startIndex = content.indexOf(searchPattern, parentStartPos);
    
    if (startIndex !== -1) {
        const endIndex = startIndex + searchPattern.length;
        codes.push([startIndex, endIndex]);
        // Update parentStartPos to avoid finding the same match again
        return endIndex;
    }
    
    return parentStartPos;
}

// Process inline tokens that may contain inline code
function processInlineToken(token: Token, lineStarts: number[], lines: string[], content: string, parentStartPos: number): number {
    // Guard clause for missing children or map
    if (!token.children || token.children.length === 0) {return parentStartPos;}
    
    // For inline tokens, we need to calculate their position in the content
    let inlineStartPos = parentStartPos;
    if (token.map && token.map.length === 2) {
        const [startLine] = token.map;
        inlineStartPos = lineToCharPosition(startLine, lineStarts, lines, content);
    }
    
    return inlineStartPos;
}

export function resolveBlockCodes(this: LoaderContext, content: string) {
    // Create markdown-it instance with minimal configuration
    const md = new MarkdownIt({html: true});
    
    // Parse the content to get tokens
    const tokens = md.parse(content, {});
    
    // Extract code block positions from tokens
    const codes: Array<[number, number]> = [];
    
    // Precompute line start positions
    const lineStarts = computeLineStarts(content);
    const lines = content.split('\n');
    
    function extractCodeBlocks(tokens: Token[], parentStartPos = 0) {
        for (const token of tokens) {
            let currentParentStartPos = parentStartPos;
            
            // Process different types of tokens
            if (token.type === 'fence' || token.type === 'code_block') {
                processBlockCode(token, lineStarts, lines, content, codes);
            } else if (token.type === 'inline') {
                // Process inline token and get updated start position
                currentParentStartPos = processInlineToken(token, lineStarts, lines, content, parentStartPos);
                
                // Process children to find code_inline tokens
                if (token.children && token.children.length > 0) {
                    extractCodeBlocks(token.children, currentParentStartPos);
                }
                
                // Continue to next token, don't process children again
                continue;
            } else if (token.type === 'code_inline') {
                currentParentStartPos = processInlineCode(token, content, parentStartPos, codes);
            }
            
            // Recursively process children for all other token types
            if (token.children && token.children.length > 0 && token.type !== 'inline') {
                extractCodeBlocks(token.children, currentParentStartPos);
            }
        }
    }
    
    extractCodeBlocks(tokens);
    
    // Set the code block positions in the API
    this.api.blockCodes.set(codes);
    
    return content;
}

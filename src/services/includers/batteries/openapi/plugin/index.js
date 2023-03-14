// @ts-ignore
/* eslint-disable */
Object.defineProperty(exports, '__esModule', {value: true});
const html_escaper_1 = require('html-escaper');
function parserOpenapiSandboxBlock(state, start, end, silent) {
    let firstLine, lastLine, next, lastPos, found = false, pos = state.bMarks[start] + state.tShift[start], max = state.eMarks[start];
    const startMark = '{% openapi sandbox %}';
    const endMark = '{% end openapi sandbox %}';
    if (pos + startMark.length > max) {
        return false;
    }
    if (state.src.slice(pos, pos + startMark.length) !== startMark) {
        return false;
    }
    pos += startMark.length;
    firstLine = state.src.slice(pos, max);
    if (silent) {
        return true;
    }
    if (firstLine.slice(-endMark.length) === endMark) {
        firstLine = firstLine.slice(0, -endMark.length);
        found = true;
    }
    for (next = start; !found;) {
        next++;
        if (next >= end) {
            break;
        }
        pos = state.bMarks[next] + state.tShift[next];
        max = state.eMarks[next];
        if (pos < max && state.tShift[next] < state.blkIndent) {
            // non-empty line with negative indent should stop the list:
            break;
        }
        if (state.src.slice(pos, max).slice(-endMark.length) === endMark) {
            lastPos = state.src.slice(0, max).lastIndexOf(endMark);
            lastLine = state.src.slice(pos, lastPos);
            found = true;
        }
    }
    state.line = next + 1;
    const token = state.push('openapi_sandbox_block', 'openapi_sandbox', 0);
    token.block = true;
    token.content = (firstLine ? firstLine + '\n' : '')
        + state.getLines(start + 1, next, state.tShift[start], true)
        + (lastLine ? lastLine : '');
    token.map = [start, state.line];
    token.markup = startMark;
    return true;
}
const openapiSandboxPlugin = (md) => {
    const openapiSandboxBlock = (jsonString) => {
        try {
            const props = html_escaper_1.escape(jsonString);
            return `<div class="yfm-sandbox-js" data-props="${props}"></div>`;
        } catch (error) {
            console.log(error);
            return jsonString;
        }
    };
    const openapiSandboxRenderer = (tokens, idx) => {
        return openapiSandboxBlock(tokens[idx].content);
    };
    try {
        md.block.ruler.before('meta', 'openapi_sandbox_block', parserOpenapiSandboxBlock);
    } catch (e) {
        md.block.ruler.push('openapi_sandbox_block', parserOpenapiSandboxBlock);
    }
    md.renderer.rules.openapi_sandbox_block = openapiSandboxRenderer;
};
exports.default = openapiSandboxPlugin;
//# sourceMappingURL=index.js.map

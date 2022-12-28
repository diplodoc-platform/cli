import StateBlock from 'markdown-it/lib/rules_block/state_block';
import Token from 'markdown-it/lib/token';
import {MarkdownItPluginCb} from '@doc-tools/transform/lib/plugins/typings';
import {Parameters} from './types';

function parserOpenapiSandboxBlock(state: StateBlock, start: number, end: number, silent: boolean) {
    let firstLine, lastLine, next, lastPos, found = false,
        pos = state.bMarks[start] + state.tShift[start],
        max = state.eMarks[start];

    const startMark = '{% openapi sandbox %}';
    const endMark = '{% end openapi sandbox %}';
    if (pos + startMark.length > max) { return false; }

    if (state.src.slice(pos, pos + startMark.length) !== startMark) { return false; }
    pos += startMark.length;
    firstLine = state.src.slice(pos, max);


    if (silent) { return true; }
    if (firstLine.slice(-endMark.length) === endMark) {
        firstLine = firstLine.slice(0, -endMark.length);
        found = true;
    }

    for (next = start; !found;) {

        next++;

        if (next >= end) { break; }

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

const createInput = ({value, name, label}: {value: string; name: string; label: string}) => {
    return `<div style="display: flex; gap: 20px; align-items: center;"><p style="margin: 0;">${label}</p><span class="yc-text-input yc-text-input_view_normal yc-text-input_size_m yc-text-input_pin_round-round"><textarea class="yc-text-input__control yc-text-input__control_type_textarea" rows="1" style="height: 28px;" name="${name}">${value}</textarea></span></div>`;
};

const createButton = ({children}: {children: string}) => {
    return `<button class="yc-button yc-button_view_action yc-button_size_xl yc-button_pin_round-round" type="button"><span class="yc-button__text">${children}</span></button>`;
};

const createColumn = ({children, gap = 20}: {children: string[]; gap?: number}) => {
    return `<div style="display: flex; flex-direction: column; gap: ${gap}px;">${children.map((child) => `<div>${child}</div>`).join('')}</div>`;
};

const createTitle = ({children}: {children: string}) => {
    return `<h3>${children}</h3>`;
};

type Data = {
    pathParams?: Parameters;
};

const openapiSandboxPlugin: MarkdownItPluginCb = (md) => {
    const openapiSandboxBlock = (jsonString: string) => {
        try {
            const data = JSON.parse(jsonString) as Data;
            const pathParamsInputs = data.pathParams
                ? data.pathParams
                    .map((param) =>
                        createInput({value: '', name: param.name, label: param.name + ':'}))
                : null;
            return createColumn({
                children: [
                    ...pathParamsInputs ? [
                        createColumn({
                            gap: 0,
                            children: [
                                createTitle({children: 'Path params'}),
                                createColumn({children: pathParamsInputs, gap: 10}),
                            ],
                        }),
                    ] : [],
                    createButton({children: 'Кнопочка'}),
                ],
            });
        } catch (error) {
            console.log(error);
            return jsonString;
        }
    };

    const openapiSandboxRenderer = (tokens: Token[], idx: number) => {
        return openapiSandboxBlock(tokens[idx].content);
    };

    md.block.ruler.after('blockquote', 'openapi_sandbox_block', parserOpenapiSandboxBlock);
    md.renderer.rules.openapi_sandbox_block = openapiSandboxRenderer;
};

export default openapiSandboxPlugin;

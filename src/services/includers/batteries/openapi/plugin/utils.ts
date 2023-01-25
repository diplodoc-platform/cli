import {Parameter} from '../types';
import {ClassName, DataAttribute, Text} from './constants';

const createText = (children: string, {className = '', bold = false} = {}) => {
    const text = `<p class="${className}">${children}</p>`;
    return bold ? `<b>${text}</b>` : text;
};

export const createDiv = (children: string, {className = '', style = ''} = {}) => {
    return `<div style="${style}" class="${className}">${children}</div>`;
};

export const createColumn = (children: string[], {gap = 20, className = '', style = ''} = {}) => {
    return createDiv(children.join(''), {
        className,
        style: `display: flex; flex-direction: column; gap: ${gap}px; ${style}`,
    });
};

type TitleLevel = 1 | 2 | 3 | 4 | 5 | 6;

const createTitle = (children: string, {level = 1 as TitleLevel} = {}) => {
    return `<h${level}>${children}</h${level}>`;
};

export const createButton = (children: string, {attributes = {} as Record<string, string>} = {}) => {
    return `<button
                class="yc-button yc-button_view_action yc-button_size_xl yc-button_pin_round-round ${ClassName.BUTTON_SUBMIT}"
                type="button"
                ${Object.entries(attributes).map(([key, value]) => `${key}="${value}"`).join(' ')}
            >
                <span class="yc-button__text">${children}</span>
            </button>`;
};

const createCard = (children: string, {className = '', style = ''}: {className?: string; style?: string}) => {
    return `<div class="yfm-clipboard"><pre><code class="hljs ${className}" style="${style}">${children}</code></pre></div>`;
};

const createInput = (
    value: string,
    {
        name,
        label = '',
        rows = 1,
        placeholder = '',
        required = false,
        className = '',
    }: {
        name: string;
        label?: string;
        rows?: number;
        placeholder?: string;
        required?: boolean;
        className?: string;
    }) => {
    const additionalForLabel = required ? '<span class="yfm-sandbox-danger">*</span>:' : ':';
    return `<div class="yfm-sandbox-input-wrapper">
                ${label ? createText(label + additionalForLabel) : ''}
                <span class="yc-text-input yc-text-input_view_normal yc-text-input_size_m yc-text-input_pin_round-round">
                    <textarea
                        placeholder="${placeholder}"
                        class="yc-text-input__control yc-text-input__control_type_textarea ${className}"
                        rows="${rows}"
                        style="height: ${22 * rows + 6}px;"
                        name="${name}"
                        ${DataAttribute.REQUIRED}="${required ? 'true' : 'false'}"
                    >${value}</textarea>
                </span>
            </div>`;
};

export const createParamInputsSection = ({
    params,
    title,
    classNameInputs,
}: {
    params?: Array<Parameter & {placeholder?: string}>;
    title: string;
    classNameInputs: string;
}) => {
    const paramInputs = params?.length
        ? params
            .map((param) =>
                createInput(param.example ? String(param.example) : '', {
                    name: param.name,
                    label: param.name,
                    placeholder: param.placeholder,
                    required: param.required,
                    className: classNameInputs,
                }),
            )
        : null;
    return paramInputs ? createColumn([
        createTitle(title, {level: 3}),
        createColumn(paramInputs, {gap: 10}),
    ], {
        gap: 0,
    }) : null;
};

export const createBodyInputSection = (value?: string) => {
    if (value === undefined || value === null) {
        return null;
    }

    const rows = Math.max(Math.min((value.match(/\n/g) || []).length, 10), 1);

    return createColumn([
        createTitle(Text.BODY_INPUT_LABEL, {level: 3}),
        createInput(value, {name: 'body', rows}),
    ], {
        gap: 0,
        className: ClassName.BODY_INPUT,
    });
};

export const createLoaderContainer = () => {
    return createColumn([
        '<div class="yfm-sandbox-loader"><div class="yfm-sandbox-loader__inner"></div></div>',
    ], {
        className: [ClassName.LOADER_CONTAINER, ClassName.HIDDEN].join(' '),
        gap: 0,
        style: 'height: 300px; width: 100%; display: flex; align-items: center; justify-content: center;',
    });
};

export const createResponseErrorContainer = () => {
    return createColumn([
        createTitle(Text.RESPONSE_ERROR_SECTION_TITLE, {level: 3}),
        createCard('', {className: ClassName.ERROR_VALUE}),
    ], {
        className: [ClassName.RESPONSE_ERROR_CONTAINER, ClassName.HIDDEN].join(' '),
        gap: 0,
    });
};

export const createResponseContainer = () => {
    return createColumn([
        createTitle(Text.RESPONSE_SECTION_TITLE, {level: 3}),
        createColumn([
            createColumn([
                createText(Text.URL_VALUE_LABEL, {bold: true}),
                createText('', {className: ClassName.URL_VALUE}),
            ], {
                gap: 0,
            }),
            createColumn([
                createText(Text.RESPONSE_STATUS_LABEL, {bold: true}),
                createText('', {className: ClassName.RESPONSE_STATUS_VALUE}),
            ], {
                gap: 0,
            }),
            createColumn([
                createText(Text.RESPONSE_BODY_LABEL, {bold: true}),
                createCard('', {className: ClassName.RESPONSE_BODY_VALUE}),
            ], {
                gap: 0,
            }),
        ], {
            gap: 10,
        }),
    ], {
        className: [ClassName.RESPONSE_CONTAINER, ClassName.HIDDEN].join(' '),
        gap: 0,
    });
};

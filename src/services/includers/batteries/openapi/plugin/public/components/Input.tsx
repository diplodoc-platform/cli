import React from 'react';
import cn from 'classnames';

const Text: React.FC<{
    className?: string;
    bold?: boolean;
}> = ({className = '', bold = false, children} = {}) => {
    const text = <p className={ className }>{ children }</p>;

    return bold ? <b>{ text }</b> : text;
};

export const Input: React.FC<{
    name: string;
    value: string;
    label?: string;
    rows?: number;
    placeholder?: string;
    required?: boolean;
    className?: string;
}> = ({
    name,
    value = '',
    label = '',
    rows = 1,
    placeholder = '',
    required = false,
    className = '',
}) => {
    const style = {
        height: (22 * rows + 6) + 'px',
    };

    return (
        <div className="yfm-sandbox-input-wrapper">
            { label ? (
                <Text>
                    { label }
                    { required ? <span className="yfm-sandbox-danger">*</span> : null }
                </Text>) : null
            }
            <span
                className="yc-text-input yc-text-input_view_normal yc-text-input_size_m yc-text-input_pin_round-round">
                <textarea
                    placeholder={ placeholder }
                    className={ cn('yc-text-input__control', 'yc-text-input__control_type_textarea', className) }
                    rows={ rows }
                    style={ style }
                    name={ name }
                    required={ Boolean(required) }
                >{ value }</textarea>
            </span>
        </div>
    );
};

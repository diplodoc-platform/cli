import React, {useState} from 'react';
// @ts-ignore
import block from 'bem-cn-lite';

import './TextInput.scss';

const b = block('TextInput');

export interface TextInputProps {
    className?: string;
    placeholder?: string;
    onChange?: Function;
}

export default function TextInput(props: TextInputProps) {
    const {className, placeholder, onChange} = props;
    const [value, setValue] = useState('');

    return (
        <span className={className}>
            <input
                className={b()}
                placeholder={placeholder}
                value={value}
                onChange={(event) => {
                    const val = event.target.value || '';
                    setValue(val);

                    if (onChange) {
                        onChange(val);
                    }
                }}/>
        </span>
    );
}

import React from 'react';
import {Parameter} from '../../../types';

import {Column} from './Column';
import {Input} from './Input';
import {Title} from './Title';

export const Params: React.FC<{
    params?: Array<Parameter & { placeholder?: string }>;
    title: string;
    classNameInputs: string;
}> = ({params, title, classNameInputs}) => {
    if (!params || !params.length) {
        return null;
    }

    return (
        <Column gap={0}>
            <Title level={3}>{title}</Title>
            <Column gap={10}>
                { params.map((param) => (
                    <Input
                        value={ param.example ? String(param.example) : '' }
                        name={ param.name }
                        label={ param.name }
                        placeholder={ param.placeholder }
                        required={ param.required }
                        className={ classNameInputs }
                    />
                )) }
            </Column>
        </Column>
    );
};

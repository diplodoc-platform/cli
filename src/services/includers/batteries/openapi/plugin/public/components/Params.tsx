import React, {Dispatch, SetStateAction} from 'react';
import {TextInput, Text} from '@gravity-ui/uikit';

import {Parameter} from '../../../types';

import {FormValueState, ParamType} from '../types';
import {Column} from './Column';

export const Params: React.FC<{
    title: string;
    params?: Array<Parameter & { placeholder?: string }>;
    type: ParamType;
    setState: Dispatch<SetStateAction<FormValueState>>;
    state: FormValueState;
    setValidateError: Dispatch<SetStateAction<FormValueState>>;
    validateError: FormValueState;
}> = ({
    params,
    title,
    type,
    setState,
    state,
    setValidateError,
    validateError,
}) => {
    if (!params || !params.length) {
        return null;
    }

    const createOnChange = (paramName: string) => (value: string) => {
        setState((prevState) => ({
            ...prevState,
            [type]: {
                ...prevState[type],
                [paramName]: value,
            },
        }));
        setValidateError((prevState) => ({
            ...prevState,
            [type]: {
                ...prevState[type],
                [paramName]: undefined,
            },
        }));
    };

    return (
        <Column gap={15}>
            <Text variant="header-1">{title}</Text>
            <Column gap={10}>
                {params.map((param, index) => (
                    <Column gap={5} key={index}>
                        <Text variant="body-2">
                            {param.name}
                            {Boolean(param.required) && <Text variant="body-2" color="danger">*</Text>}:
                        </Text>

                        <TextInput
                            value={state[type][param.name]}
                            name={param.name}
                            placeholder={param.placeholder}
                            onUpdate={createOnChange(param.name)}
                            error={validateError[type][param.name]}
                        />
                    </Column>
                ))}
            </Column>
        </Column>
    );
};

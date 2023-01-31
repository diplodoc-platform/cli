import React, {Dispatch, SetStateAction} from 'react';
import {TextInput, Text} from '@gravity-ui/uikit';

import {Text as TextEnum} from '../../constants';

import {FormValueState} from '../types';
import {Column} from './Column';

export const Body: React.FC<{
    setState: Dispatch<SetStateAction<FormValueState>>;
    state: FormValueState;
    setValidateError: Dispatch<SetStateAction<FormValueState>>;
    validateError: FormValueState;
}> = ({
    setState,
    state,
    setValidateError,
    validateError,
}) => {
    const value = state.body;
    if (value === undefined || value === null) {
        return null;
    }

    const onChange = (newValue: string) => {
        setState((prevState) => ({
            ...prevState,
            body: newValue,
        }));
        setValidateError((prevState) => ({
            ...prevState,
            body: undefined,
        }));
    };

    return (
        <Column gap={10}>
            <Text variant="header-1">{TextEnum.BODY_INPUT_LABEL}</Text>
            <TextInput
                error={validateError.body}
                multiline
                maxRows={10}
                name="body"
                value={value}
                onUpdate={onChange}
            />
        </Column>
    );
};

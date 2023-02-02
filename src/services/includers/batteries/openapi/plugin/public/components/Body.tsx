import type {Field, Nullable} from '../types';
import React from 'react';
import {TextInput, Text} from '@gravity-ui/uikit';

import {Text as TextEnum} from '../../constants';

import {Column} from './Column';

type Props = {
    value: Nullable<string>;
};

type State = {
    error: Nullable<string>;
    value: Nullable<string>;
};

export class Body extends React.Component<Props, State> implements Field<string, string> {
    constructor(props: Props) {
        super(props);

        this.state = {
            error: null,
            value: props.value,
        };
    }

    render() {
        const {error, value} = this.state;

        if (value === undefined || value === null) {
            return null;
        }

        const onChange = (newValue: string) => {
            this.setState((prevState) => ({
                ...prevState,
                value: newValue,
            }));
        };

        return (
            <Column gap={10}>
                <Text variant="header-1">{TextEnum.BODY_INPUT_LABEL}</Text>
                <TextInput
                    error={error || false}
                    multiline
                    maxRows={10}
                    name="body"
                    value={value}
                    onUpdate={onChange}
                />
            </Column>
        );
    }

    validate() {
        const error = this.state.value ? undefined : 'Required';

        this.setState({error});

        return error;
    }

    value() {
        return this.state.value;
    }
}

import React from 'react';

import {Column} from './Column';
import {Input} from './Input';
import {Title} from './Title';
import {ClassName, Text} from '../../constants';

export const Body: React.FC<{
    value?: string;
}> = ({value}) => {
    if (value === undefined || value === null) {
        return null;
    }

    const rows = Math.max(Math.min((value.match(/\n/g) || []).length, 10), 1);

    return (
        <Column gap={0}>
            <Title level={3}>{Text.BODY_INPUT_LABEL}</Title>
            <Column gap={0} className={ClassName.BODY_INPUT}>
                <Input name="body" value={value} rows={rows} />
            </Column>
        </Column>
    );
};

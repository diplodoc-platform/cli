import React from 'react';
import {Text, Card} from '@gravity-ui/uikit';

import {Text as TextEnum} from '../../constants';
import {ErrorState} from '../types';
import {Column} from './';

export const Error = ({message}: ErrorState) => {
    return <Column>
        <Text variant="header-1">{TextEnum.RESPONSE_ERROR_SECTION_TITLE}</Text>
        <Card
            theme="danger"
            type="container"
            view="filled"
        >
            <Text
                variant="body-3"
                className="yfm-sandbox-card-text"
            >
                {message}
            </Text>
        </Card>
    </Column>;
};

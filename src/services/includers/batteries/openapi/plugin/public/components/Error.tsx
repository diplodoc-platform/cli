import React from 'react';
import {Text, Card} from '@gravity-ui/uikit';

import {Text as TextEnum, yfmSandbox, possibleReasonsFailToFetch} from '../../constants';
import {ErrorState} from '../types';
import {Column} from './';

export const Error = ({message}: ErrorState) => {
    return <Column>
        <Text variant="header-1">{TextEnum.RESPONSE_ERROR_SECTION_TITLE}</Text>
        <Card
            theme="danger"
            type="container"
            view="filled"
            className={yfmSandbox('card')}
        >
            <Text
                variant="code-2"
                className={yfmSandbox('card-text')}
            >
                {message} <br/>
                Possible Reasons:
                <ul className={yfmSandbox('possible-reasons')}>
                    {possibleReasonsFailToFetch.map((item, index) => (
                        <li key={index}>
                            {item}
                        </li>
                    ))}
                </ul>
            </Text>
        </Card>
    </Column>;
};

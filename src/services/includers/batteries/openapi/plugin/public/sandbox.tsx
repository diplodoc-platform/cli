import React from 'react';

import {Column, Params, Body} from './components';

import './sandbox.scss';
import {ClassName, Text} from '../constants';

export const Sandbox: React.FC<{
    options: Record<string, any>;
}> = ({options}) => {
    const hasOAuth2 = options.security?.find(({type}) => type === 'oauth2');
    const headers = options.headers ? [...options.headers] : [];

    if (hasOAuth2) {
        headers.push({
            name: 'Authorization',
            schema: {
                type: 'string',
            },
            in: 'header',
            required: true,
            description: '',
            example: 'Bearer <token>',
        });
    }

    return (
        <Column>
            <Params
                title={Text.PATH_PARAMS_SECTION_TITLE}
                params={options.pathParams}
                classNameInputs={ClassName.PATH_PARAM_INPUT}
            />
            <Params
                title={Text.QUERY_PARAMS_SECTION_TITLE}
                params={options.queryParams}
                classNameInputs={ClassName.QUERY_PARAM_INPUT}
            />
            <Params
                title={Text.HEADER_PARAMS_SECTION_TITLE}
                params={headers}
                classNameInputs={ClassName.HEADER_INPUT}
            />
            <Body/>
        </Column>
    );
};

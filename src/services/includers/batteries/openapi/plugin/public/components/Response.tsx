import React from 'react';
import {Text, Card} from '@gravity-ui/uikit';

import {Text as TextEnum} from '../../constants';
import {ResponseState} from '../types';
import {Column} from './';

export const Response: React.FC<ResponseState> = ({
    responseString,
    url,
    status,
    file,
}) => {
    return <Column gap={10}>
        <Text variant="header-1">{TextEnum.RESPONSE_SECTION_TITLE}</Text>
        <div>
            <Text variant="subheader-2" as="div">{TextEnum.RESPONSE_STATUS_LABEL}:</Text>
            <Text variant="body-2" as="div">{status}</Text>
        </div>
        <div>
            <Text variant="subheader-2" as="div">{TextEnum.URL_VALUE_LABEL}:</Text>
            <Text variant="body-2" as="div">{url}</Text>
        </div>
        <div>
            {responseString === undefined ? null : <Text variant="subheader-2">{TextEnum.RESPONSE_BODY_LABEL}:</Text>}
            <Card
                theme="info"
                type="container"
                view="filled"
            >
                <Text
                    variant="code-2"
                    className="yfm-sandbox-card-text"
                >
                    {file ? <Text>
                        {TextEnum.RESPONSE_FILE_TEXT}
                        <a href={file.url} download={file.name}>
                            {TextEnum.RESPONSE_FILE_TEXT_CLICK}
                        </a>
                    </Text> : null}
                    {responseString === undefined ? null : <pre className="yfm-sandbox-pre">{responseString}</pre>}
                </Text>
            </Card>
        </div>

    </Column>;
};

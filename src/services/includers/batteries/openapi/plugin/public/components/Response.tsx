import type {ResponseState} from '../types';
import React, {useState, useEffect} from 'react';
import {Text, Card} from '@gravity-ui/uikit';

import {Text as TextEnum} from '../../constants';
import {Column} from './';

export const Response: React.FC<{
    response: ResponseState;
}> = ({response}) => {
    const {url, status, file, text} = response;

    const [fileUrl, setFileUrl] = useState<string | null>(null);

    useEffect(() => {
        if (file) {
            setFileUrl(window.URL.createObjectURL(file.blob));
        }

        return () => {
            if (fileUrl) {
                window.URL.revokeObjectURL(fileUrl);
            }
        };
    }, [file]);

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
            {text !== undefined && <Text variant="subheader-2">{TextEnum.RESPONSE_BODY_LABEL}:</Text>}
            <Card
                theme="info"
                type="container"
                view="filled"
                className="yfm-sandbox-card"
            >
                <Text
                    variant="code-2"
                    className="yfm-sandbox-card-text"
                >
                    {file && fileUrl && <Text>
                        {TextEnum.RESPONSE_FILE_TEXT}
                        <a href={fileUrl} download={file.name}>
                            {TextEnum.RESPONSE_FILE_TEXT_CLICK}
                        </a>
                    </Text>}
                    {text !== undefined && <pre className="yfm-sandbox-pre">{text}</pre>}
                </Text>
            </Card>
        </div>
    </Column>;
};

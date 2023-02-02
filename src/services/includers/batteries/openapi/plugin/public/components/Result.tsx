import type {ResponseState, ErrorState} from '../types';
import React, {useState, useEffect} from 'react';
import {Loader} from './Loader';
import {Response} from './Response';
import {Error} from './Error';

export const getAttachName = (response: Response): string => {
    const unknownName = 'unknown file';
    const disposition = response.headers.get('Content-Disposition');

    if (disposition) {
        const filenameRegex = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/;
        const matches = filenameRegex.exec(disposition);
        if (matches !== null && matches[1]) {
            return matches[1].replace(/['"]/g, '');
        }
    }

    return unknownName;
};

async function processResponse(response: Response): Promise<ResponseState> {
    const contentType = response.headers.get('Content-Type') || '';
    const contentDisposition = response.headers.get('Content-Disposition') || '';
    const isAttachment = contentDisposition.includes('attachment');

    if (isAttachment) {
        return {
            status: response.status,
            url: response.url,
            file: {
                blob: await response.blob(),
                name: getAttachName(response),
            },
        };
    } else {
        let text: string;

        if (contentType.includes('json')) {
            text = JSON.stringify(await response.json(), null, 2);
        } else {
            text = await response.text();
        }

        return {
            status: response.status,
            url: response.url,
            text,
        };
    }
}

export const Result: React.FC<{
    request: Promise<Response>;
}> = ({request}) => {
    const [response, setResponse] = useState<ResponseState | null>(null);
    const [error, setError] = useState<ErrorState | null>(null);

    useEffect(() => {
        const scope = request;
        const onResponse = (result: ResponseState) => scope === request ? setResponse(result) : null;
        const onError = (result: ErrorState) => scope === request ? setError(result) : null;

        request
            .then(processResponse)
            .then(onResponse, onError);

        return () => {
            setResponse(null);
            setError(null);
        };
    }, [request]);

    return (
        <>
            { !response && !error && <Loader /> }
            { response && <Response response={response} /> }
            { error && <Error message={error.message} /> }
        </>
    );
};

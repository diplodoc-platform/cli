import {Method, Parameters, Security} from '../../types';
import {ErrorState, FormValueState, ResponseState} from './types';
import React, {Dispatch, SetStateAction} from 'react';

export const saveFile = (file: Blob, fileName: string) => {
    const url = window.URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;

    a.download = fileName;
    a.innerText = 'click';
    document.body.appendChild(a);
    a.click();

    return url;
};

export const getAttachNameFromResponse = (response: Response): string => {
    const unknownName = 'unknown file';
    const disposition = response.headers.get('Content-Disposition');
    if (disposition) {
        const filenameRegex = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/;
        const matches = filenameRegex.exec(disposition);
        if (matches !== null && matches[1]) {
            return matches[1].replace(/['"]/g, '');
        }
        return unknownName;
    }
    return unknownName;
};

export const formValueToFetchOptions = (requestUrl: string, formValue: FormValueState) => {
    Object.entries(formValue.path).forEach(([key, value]) => {
        requestUrl = requestUrl.replace(`{${key}}`, encodeURIComponent(value));
    });

    const searchParams = new URLSearchParams();
    Object.entries(formValue.search).forEach(([key, value]) => {
        searchParams.append(key, value);
    });

    const headers: Record<string, string> = {};
    Object.entries(formValue.headers).forEach(([key, value]) => {
        headers[key] = value;
    });

    const fetchUrl = requestUrl + (searchParams.toString() ? '?' + searchParams.toString() : '');
    const {body} = formValue;

    return {
        headers,
        fetchUrl,
        body,
    };
};

export const prepareHeaders = ({headers, security}: {
    security?: Security[];
    headers?: Parameters;
}) => {
    const preparedHeaders = headers ? [...headers] : [];

    const hasOAuth2 = security?.find(({type}) => type === 'oauth2');
    if (hasOAuth2) {
        preparedHeaders.push({
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
    return preparedHeaders;
};

const validateParameters = (
    parameters: Parameters | undefined,
    value: Record<string, string>,
): Record<string, string> => {
    if (!parameters) {
        return {};
    }
    return parameters.reduce((acc, item) => {
        if (item.required && !value[item.name]) {
            return {...acc, [item.name]: 'Required'};
        } else {
            return acc;
        }
    }, {});
};

export const createSubmit = ({
    host,
    path,
    method,
    setLoading,
    setResponse,
    setError,
    setValidateError,
    formValue,
    validate,
}: {
    host?: string;
    path: string;
    method: Method;
    setLoading: Dispatch<SetStateAction<boolean>>;
    setResponse: Dispatch<SetStateAction<null | ResponseState>>;
    setError: Dispatch<SetStateAction<null | ErrorState>>;
    setValidateError: Dispatch<SetStateAction<FormValueState>>;
    formValue: FormValueState;
    validate: {
        pathParams?: Parameters;
        searchParams?: Parameters;
        headers?: Parameters;
        body?: string;
    };
}) => {
    return async (e: React.FormEvent) => {
        e.preventDefault();
        const errorObj = {
            headers: validateParameters(validate.headers, formValue.headers),
            path: validateParameters(validate.pathParams, formValue.path),
            search: validateParameters(validate.searchParams, formValue.search),
            body: validate.body && !formValue.body ? 'Required' : undefined,
        };

        if (
            errorObj.body ||
            Object.keys(errorObj.headers).length ||
            Object.keys(errorObj.path).length ||
            Object.keys(errorObj.search).length
        ) {
            setValidateError(errorObj);
            return;
        }

        setLoading(true);
        setResponse(null);
        setError(null);

        try {
            const {
                headers,
                fetchUrl,
                body,
            } = formValueToFetchOptions((host ?? '') + '/' + path, formValue);

            const fetchResponse = await fetch(fetchUrl, {
                headers,
                ...body ? {body: JSON.stringify(body)} : {},
                method,
            });

            const contentType = fetchResponse.headers.get('Content-Type') || '';
            const contentDisposition = fetchResponse.headers.get('Content-Disposition') || '';
            const isAttachment = contentDisposition.includes('attachment');

            if (isAttachment) {
                const blob = await fetchResponse.blob();
                const fileName = getAttachNameFromResponse(fetchResponse);
                const urlFallback = saveFile(blob, fileName);

                setLoading(false);
                setResponse({
                    status: fetchResponse.status,
                    url: fetchUrl,
                    file: {
                        url: urlFallback,
                        name: fileName,
                    },
                });
            } else {
                let responseString: string;
                if (contentType.includes('json')) {
                    responseString = JSON.stringify(await fetchResponse.json(), null, 2);
                } else {
                    responseString = await fetchResponse.text();
                }
                setLoading(false);
                setResponse({
                    status: fetchResponse.status,
                    url: fetchUrl,
                    responseString,
                });
            }
        } catch (err) {
            setLoading(false);
            setError({
                message: err.message,
            });
        }
    };
};

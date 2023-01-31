import React, {useState} from 'react';

import {Button} from '@gravity-ui/uikit';

import {Column, Params, Body, Response, Error, Loader} from './components';

import {SandboxProps} from '../../types';
import {Text} from '../constants';
import {ResponseState, ErrorState, FormValueState} from './types';
import {useFormState} from './hooks';
import {createSubmit, prepareHeaders} from './utils';

import './sandbox.scss';

export const Sandbox: React.FC<SandboxProps> = (props) => {
    const preparedHeaders = prepareHeaders(props);
    const [formValue, setFormValue] = useFormState({
        pathParams: props.pathParams,
        headers: preparedHeaders,
        body: props.body,
        searchParams: props.searchParams,
    });
    const [validateError, setValidateError] = useState<FormValueState>({
        path: {},
        headers: {},
        search: {},
        body: undefined,
    });
    const [isLoading, setLoading] = useState(false);
    const [response, setResponse] = useState<ResponseState | null>(null);
    const [error, setError] = useState<ErrorState | null>(null);

    const onSubmit = createSubmit({
        host: props.host,
        path: props.path,
        method: props.method,
        formValue,
        setLoading,
        setError,
        setResponse,
        setValidateError,
        validate: {
            headers: props.headers,
            searchParams: props.searchParams,
            pathParams: props.pathParams,
            body: props.body,
        },
    });

    return (
        <form onSubmit={onSubmit}>
            <Column>
                <Params
                    title={Text.PATH_PARAMS_SECTION_TITLE}
                    params={props.pathParams}
                    setState={setFormValue}
                    state={formValue}
                    setValidateError={setValidateError}
                    validateError={validateError}
                    type="path"
                />
                <Params
                    title={Text.QUERY_PARAMS_SECTION_TITLE}
                    params={props.searchParams}
                    setState={setFormValue}
                    state={formValue}
                    setValidateError={setValidateError}
                    validateError={validateError}
                    type="search"
                />
                <Params
                    title={Text.HEADER_PARAMS_SECTION_TITLE}
                    params={preparedHeaders}
                    setState={setFormValue}
                    state={formValue}
                    setValidateError={setValidateError}
                    validateError={validateError}
                    type="headers"
                />
                <Body
                    state={formValue}
                    setState={setFormValue}
                    validateError={validateError}
                    setValidateError={setValidateError}
                />
                {
                    isLoading
                        ? <Loader />
                        : <>
                            {response ? <Response {...response} /> : null}
                            {error ? <Error {...error} /> : null}
                        </>
                }
                <div>
                    <Button size="l" view="action" type="submit">
                        {Text.BUTTON_SUBMIT}
                    </Button>
                </div>
            </Column>
        </form>
    );
};

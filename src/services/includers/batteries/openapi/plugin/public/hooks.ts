import {useState} from 'react';

import {Parameters} from '../../types';
import {FormValueState} from './types';

type UseFormStateParams = {
    pathParams?: Parameters;
    searchParams?: Parameters;
    headers?: Parameters;
    body?: string;
};

const mapParametersToObject = (parameters?: Parameters | undefined): Record<string, string> => {
    if (!parameters) {
        return {} as Record<string, string>;
    }
    return parameters.reduce((acc, {name, example}) => ({
        ...acc,
        [name]: example ? String(example) : '',
    }), {});
};

export const useFormState = ({pathParams, searchParams, headers, body}: UseFormStateParams) => {
    return useState<FormValueState>({
        headers: mapParametersToObject(headers),
        path: mapParametersToObject(pathParams),
        search: mapParametersToObject(searchParams),
        body: body ? body : undefined,
    });
};

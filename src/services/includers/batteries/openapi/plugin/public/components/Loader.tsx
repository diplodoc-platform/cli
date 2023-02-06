import React from 'react';
import {Loader as LoaderBase} from '@gravity-ui/uikit';
import {yfmSandbox} from '../../constants';

export const Loader = () => {
    return <div className={yfmSandbox('loader-container')}>
        <LoaderBase />
    </div>;
};

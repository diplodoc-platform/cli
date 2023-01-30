import React, {useEffect, useState} from 'react';
import {createPortal} from 'react-dom';
import {unescape} from 'html-escaper';

import {Sandbox} from './sandbox';

export const Runtime: React.FC = () => {
    const [sandbox, setSandbox] = useState<Element | null>(null);

    useEffect(() => {
        setSandbox(document.querySelector('.yfm-sandbox'));
    });

    if (!sandbox) {
        return null;
    }

    const options = JSON.parse(unescape(sandbox.dataset.options));

    return createPortal(<Sandbox options={ options }/>, sandbox);
};

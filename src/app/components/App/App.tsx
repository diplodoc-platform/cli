import React, {ReactElement} from 'react';

import {DocLeadingPage, DocPage} from 'yfm-docs-components';

import '../../interceptors/leading-page-links';

import 'yfm-docs-components/styles/default.scss';
import 'yfm-docs-components/styles/typography.scss';
import 'yfm-docs-components/styles/themes.scss';
import 'yfm-transform/dist/css/yfm.css';
import './App.scss';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function App(props: any): ReactElement {
    const {isLeading} = props;
    const router = {
        pathname: props.pathname,
    };

    return (
        // TODO(vladimirfedin): Replace Layout__content class.
        <div className="App Layout__content">
            {isLeading
                ? <DocLeadingPage {...props} router={router}/>
                : <DocPage {...props} router={router}/>
            }
        </div>
    );
}

export default App;

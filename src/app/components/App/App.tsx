import React, {ReactElement} from 'react';

import DocLeadingPage from 'components/DocLeadingPage/DocLeadingPage';
import DocPage from 'components/DocPage/DocPage';
import {provideStyles} from 'providers/style.provider';

export function App(props: any): ReactElement {
    const {isLeading} = props;
    return (
        <div className="App">
            {isLeading
                ? <DocLeadingPage {...props} />
                : <DocPage {...props}/>
            }
        </div>
    );
}

export default provideStyles(App);

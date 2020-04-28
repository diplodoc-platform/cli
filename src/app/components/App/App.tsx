import 'styles/default.scss'
import 'styles/typography.scss';
import 'styles/themes.scss';
import 'yfm-transform/dist/css/yfm.css';

import React, {ReactElement} from 'react';

import DocLeadingPage from 'components/DocLeadingPage/DocLeadingPage';
import DocPage from 'components/DocPage/DocPage';

import 'interceptors/leading-page-links';
import './App.scss';

export function App(props: any): ReactElement {
    const {isLeading} = props;
    return (
        // TODO(vladimirfedin): Replace Layout__content class.
        <div className="App Layout__content">
            {isLeading
                ? <DocLeadingPage {...props} />
                : <DocPage {...props}/>
            }
        </div>
    );
}

export default App;

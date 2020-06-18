import React, {ReactElement} from 'react';

import {
    DocLeadingPage,
    DocPage,
    DocPageData,
    DocLeadingPageData,
    Lang,
    Router,
} from '@doc-tools/components';

import '../../interceptors/leading-page-links';

import '@doc-tools/components/styles/default.scss';
import '@doc-tools/components/styles/typography.scss';
import '@doc-tools/components/styles/themes.scss';
import '@doc-tools/transform/dist/css/yfm.css';
import './App.scss';

export interface DocProps {
    data: DocLeadingPageData | DocPageData;
}

export interface AppProps {
    lang: Lang;
    router: Router;
}

export type DocInnerProps =
    & DocProps
    & AppProps;

export function App(props: DocInnerProps): ReactElement {
    const {data, router, lang} = props;
    const pageProps = {router, lang, headerHeight: 0};

    return (
        // TODO(vladimirfedin): Replace Layout__content class.
        <div className="App Layout__content">
            {data.leading
                ? <DocLeadingPage {...data} {...pageProps}/>
                : <DocPage {...data} {...pageProps}/>
            }
        </div>
    );
}

export default App;

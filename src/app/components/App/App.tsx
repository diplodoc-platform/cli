import React, {ReactElement, useCallback, useEffect, useState} from 'react';

import {
    DocLeadingPage,
    DocLeadingPageData,
    DocPage,
    DocPageData,
    Lang,
    Router,
    TextSizes,
    Theme,
} from '@doc-tools/components';
import {getDocSettings, updateRootClassName, withSavingSetting} from '../../utils';

import '../../interceptors/leading-page-links';

import {useMermaid} from '@diplodoc/mermaid-extension/hooks';
import {Runtime as OpenapiSandbox} from '../../../services/includers/batteries/openapi/plugin/public';
import '../../../services/includers/batteries/openapi/generators/style.scss';

import '@doc-tools/components/styles/themes.scss';
import '@doc-tools/components/styles/default.scss';
import '@doc-tools/components/styles/typography.scss';
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

const MOBILE_VIEW_WIDTH_BREAKPOINT = 900;

export function App(props: DocInnerProps): ReactElement {
    const {data, router, lang} = props;

    const docSettings = getDocSettings();
    const [isMobileView, setIsMobileView] = useState(document.body.clientWidth <= MOBILE_VIEW_WIDTH_BREAKPOINT);
    const [wideFormat, setWideFormat] = useState(docSettings.wideFormat);
    const [fullScreen, setFullScreen] = useState(docSettings.fullScreen);
    const [showMiniToc, setShowMiniToc] = useState(docSettings.showMiniToc);
    const [theme, setTheme] = useState(docSettings.theme);
    const [textSize, setTextSize] = useState(docSettings.textSize);
    const pageProps = {
        router,
        lang,
        headerHeight: 0,
        wideFormat,
        fullScreen,
        showMiniToc,
        theme,
        textSize,
        onChangeFullScreen: withSavingSetting<boolean>('fullScreen', setFullScreen),
        onChangeWideFormat: withSavingSetting<boolean>('wideFormat', setWideFormat),
        onChangeShowMiniToc: withSavingSetting<boolean>('showMiniToc', setShowMiniToc),
        onChangeTheme: withSavingSetting<Theme>('theme', setTheme),
        onChangeTextSize: withSavingSetting<TextSizes>('textSize', setTextSize),
    };

    const onResizeHandler = useCallback(() => {
        setIsMobileView(document.body.clientWidth <= MOBILE_VIEW_WIDTH_BREAKPOINT);
    }, []);

    useEffect(() => {
        window.addEventListener('resize', onResizeHandler);

        return () => window.removeEventListener('resize', onResizeHandler);
    }, []);

    useEffect(() => {
        updateRootClassName(theme, isMobileView);
    }, [theme, isMobileView]);

    const renderMermaid = useMermaid();
    useEffect(() => {
        renderMermaid({
            theme: theme === Theme.Dark ? 'dark' : 'neutral',
        });
    }, [theme, renderMermaid]);

    return (
        // TODO(vladimirfedin): Replace Layout__content class.
        <div className="App Layout__content">
            {data.leading
                ? <DocLeadingPage {...data} {...pageProps}/>
                : <DocPage
                    singlePage={false}
                    bookmarkedPage={false}
                    isLiked={false}
                    isDisliked={false}
                    dislikeVariants={[]}
                    {...data}
                    {...pageProps}
                />
            }
            <OpenapiSandbox />
        </div>
    );
}

export default App;

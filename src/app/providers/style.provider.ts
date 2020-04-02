import {ReactElement} from 'react';
import withStyles from 'isomorphic-style-loader/withStyles';

import CommonStyles from '@yandex-data-ui/common/styles/styles.scss';
import MarkStyles from '@yandex-data-ui/cloud-components/build/components/Mark/Mark.scss';

import Typography from 'styles/typography.scss';
import Themes from 'styles/themes.scss';

import AppStyles from 'components/App/App.scss';
import BreadcrumbStyles from 'components/Breadcrumbs/Breadcrumbs.scss';
import DocLayoutStyles from 'components/DocLayout/DocLayout.scss';
import DocLeadingPageStyles from 'components/DocLeadingPage/DocLeadingPage.scss';
import DocPageStyles from 'components/DocPage/DocPage.scss';
import DocPageTitle from 'components/DocPageTitle/DocPageTitle.scss';
import MiniTocStyles from 'components/MiniToc/MiniToc.scss';
import TocStyles from 'components/Toc/Toc.scss';

export function provideStyles(component: (props: any) => ReactElement) {
    return withStyles(
        CommonStyles,
        MarkStyles,

        Typography,
        Themes,
        AppStyles,

        BreadcrumbStyles,
        DocLayoutStyles,
        DocLeadingPageStyles,
        DocPageStyles,
        DocPageTitle,
        MiniTocStyles,
        TocStyles,
    )(component);
}

import React from 'react';
import block from 'bem-cn-lite';
import {StageLabel} from '@yandex-data-ui/cloud-components';

import './DocPageTitle.scss';

const b = block('DocPageTitle');

export class DocPageTitle extends React.Component {
    render() {
        const {children, stage, className} = this.props;
        const visibleStage = stage === 'tech-preview' ? 'preview' : stage;
        const label = <StageLabel stage={visibleStage} className={b('label')}/>;

        return (
            <h1 className={b(null, className)}>
                {label}
                {children}
            </h1>
        );
    }
}

export default DocPageTitle;

import React from 'react';
import block from 'bem-cn-lite';
//import {Icon} from '@yandex-data-ui/common';

//import chevron from '@yandex-data-ui/common/assets/icons/chevron.svg';

import './ToggleArrow.scss';

const b = block('ToggleArrow');

export class ToggleArrow extends React.Component {
    static defaultProps = {
        type: 'horizontal',
        open: false,
        thin: false,
        slow: false,
    };

    render() {
        // TODO(vladimirfedin): Add ToggleArrow icon in navigation
        //const {type, open, size, thin, slow, className} = this.props;

        /*return (
            <Icon
                className={b({type, open, thin, slow}, className)}
                data={chevron}
                size={size}
            />
        );*/

        return (
            <div></div>
        );
    }
}

export default ToggleArrow;

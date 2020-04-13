import React from 'react';
import PropTypes from 'prop-types';
import block from 'bem-cn-lite';

import chevron from '@yandex-data-ui/common/assets/icons/chevron.svg';

import './ToggleArrow.scss';

const b = block('ToggleArrow');

export default class ToggleArrow extends React.Component {
    static propTypes = {
        type: PropTypes.oneOf(['horizontal', 'vertical']),
        open: PropTypes.bool,
        size: PropTypes.number,
        thin: PropTypes.bool,
        slow: PropTypes.bool,
        className: PropTypes.string,
    };

    static defaultProps = {
        type: 'horizontal',
        open: false,
        thin: false,
        slow: false,
    };

    render() {
        const {type, open, size, thin, slow, className} = this.props;

        return (
            <img
                className={b({type, open, thin, slow}, className)}
                src={chevron}
                height={size}
            />
        );
    }
}

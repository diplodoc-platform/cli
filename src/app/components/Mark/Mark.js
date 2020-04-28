import React from 'react';

import block from 'bem-cn-lite';
import './Mark.scss';

const b = block('cc-mark');

export default class Mark extends React.Component {
    render() {
        const {text, color, size, className} = this.props;
        return (
            React.createElement('span', {
                className: b({ color, size },className)
            }, text.toUpperCase())
        );
    }
}

Mark.defaultProps = {
    color: 'blue',
    size: 's',
};

import React from 'react';
import PropTypes from 'prop-types';

const propTypes = {
    children: PropTypes.string,
    block: PropTypes.bool,
    className: PropTypes.string,
};
const defaultProps = {
    block: false,
};

export default function HTML({children, block, className}) {
    if (!children) {
        return null;
    }

    return React.createElement(
        block ? 'div' : 'span',
        {
            dangerouslySetInnerHTML: {__html: children},
            className,
        },
    );
}

HTML.propTypes = propTypes;
HTML.defaultProps = defaultProps;

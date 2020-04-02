import React from 'react';
import PropTypes from 'prop-types';

import HTML from '../HTML/HTML';

const propTypes = {
    data: PropTypes.oneOfType([PropTypes.string, PropTypes.arrayOf(PropTypes.string)]),
    html: PropTypes.bool,
    block: PropTypes.bool,
};
const defaultProps = {
    data: '',
    html: false,
    block: false,
};

export default function Text({data, html, block}) {
    if (!data) {
        return null;
    }

    const paragraphs = Array.isArray(data) ? data : [data];

    return (
        <React.Fragment>
            {paragraphs.map((text, index) =>
                React.createElement(
                    block ? 'div' : 'p',
                    {
                        key: index,
                        className: block ? 'p' : null,
                    },
                    html ? <HTML>{text}</HTML> : text),
            )}
        </React.Fragment>
    );
}

Text.propTypes = propTypes;
Text.defaultProps = defaultProps;

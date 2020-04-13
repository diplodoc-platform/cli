import React from 'react';
import PropTypes from 'prop-types';
import block from 'bem-cn-lite';

import './Breadcrumbs.scss';

const b = block('Breadcrumbs');

class Breadcrumbs extends React.Component {
    static propTypes = {
        items: PropTypes.arrayOf(PropTypes.shape({
            name: PropTypes.string.isRequired,
            url: PropTypes.string,
        })),
        className: PropTypes.string,
    };

    renderItem({name, url}, isLast) {
        const hasUrl = Boolean(url);
        return React.createElement(
            hasUrl ? 'a' : 'span',
            {
                className: b('text', {link: hasUrl}),
                href: url,
                ['aria-current']: isLast ? 'page' : null,
            },
            name,
        );
    }

    render() {
        const {items, className} = this.props;

        if (!items) {
            return null;
        }

        return (
            <nav className={b(null, className)} aria-label="Breadcrumbs">
                <ol className={b('items')}>
                    {items.map((item, index, subItems) =>
                        <li key={index} className={b('item')}>
                            {this.renderItem(item, index === subItems.length - 1)}
                        </li>,
                    )}
                </ol>
            </nav>
        );
    }
}

export default Breadcrumbs;

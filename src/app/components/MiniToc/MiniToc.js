import React from 'react';
import PropTypes from 'prop-types';
import block from 'bem-cn-lite';

import Scrollspy from 'components/Scrollspy/Scrollspy';

import './MiniToc.scss';

const b = block('MiniToc');

export default class MiniToc extends React.Component {
    static propTypes = {
        headings: PropTypes.array.isRequired,
    };

    renderSection = (prevSections, {title, href, items}, index) => {
        let children = [];

        if (items) {
            children = items.map(({href: itemHref, title: itemTitle}) => {
                return (
                    <li
                        key={itemHref}
                        data-hash={itemHref}
                        className={b('section', {child: true})}
                    >
                        <a href={itemHref} className={b('section-link')} data-router-shallow>{itemTitle}</a>
                    </li>
                );
            });
        }

        return prevSections.concat(
            <li
                key={`section-${index}`}
                data-hash={href}
                className={b('section')}
                onClick={this.handleSectionClick}
            >
                <a href={href} className={b('section-link')} data-router-shallow>{title}</a>
            </li>,
            children,
        );
    };

    renderSections() {
        const {headings} = this.props;

        if (headings.length === 0) {
            return null;
        }

        const sectionHrefs = headings.reduce((prevHrefs, {href, items}) => {
            const children = items ? items.map(({href: itemHref}) => itemHref) : [];

            return prevHrefs.concat(href, children);
        }, []);

        if (sectionHrefs.length === 0) {
            return null;
        }

        return (
            <Scrollspy
                className={b('sections')}
                currentClassName={b('section', {active: true})}
                items={sectionHrefs}
            >
                {headings.reduce(this.renderSection, [])}
            </Scrollspy>
        );
    }

    render() {
        return (
            <div className={b()}>
                {this.renderSections()}
            </div>
        );
    }
}

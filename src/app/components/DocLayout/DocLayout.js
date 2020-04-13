import React from 'react';
import block from 'bem-cn-lite';

import Toc from 'components/Toc/Toc';

import './DocLayout.scss';

const b = block('DocLayout');

function Left() {
    return null;
}

function Center() {
    return null;
}

function Right() {
    return null;
}

export class DocLayout extends React.Component {

    static Left = Left;
    static Center = Center;
    static Right = Right;

    renderToc() {
        const {toc} = this.props;

        if (!toc) {
            return null;
        }

        return (
            <div className={b('toc')}>
                <Toc {...toc}/>
            </div>
        );
    }

    render() {
        const {children, className} = this.props;
        let left, center, right;

        React.Children.forEach(children, (child) => {
            switch (child.type) {
                case Left:
                    left = child.props.children;
                    break;
                case Center:
                    center = child.props.children;
                    break;
                case Right:
                    right = child.props.children;
                    break;
            }
        });

        return (
            <div className={b(null, className)}>
                <div className={b('left')}>
                    {this.renderToc()}
                    {left}
                </div>
                <div className={b('center')}>{center}</div>
                <div className={b('right')}>{right}</div>
            </div>
        );
    }
}

export default DocLayout;

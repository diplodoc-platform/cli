import PropTypes from 'prop-types';
import React from 'react';
import block from 'bem-cn-lite';
import _isEqual from 'lodash/isEqual';

export default class Scrollspy extends React.Component {
    static propTypes = {
        items: PropTypes.array.isRequired,
        sectionOffset: PropTypes.number,
        onSectionClick: PropTypes.func,
        className: PropTypes.string,
        currentClassName: PropTypes.string,
        headerOffset: PropTypes.number,
        children: PropTypes.array.isRequired,
    };

    static defaultProps = {
        currentClassName: 'Scrollspy',
        sectionOffset: 20,
        headerOffset: 70,
    };

    constructor(props) {
        super(props);

        this.state = {
            targetItems: [],
            inViewState: [],
        };

        this.b = block(props.className);
        this.scrollByClick = true;
    }

    componentDidMount() {
        this.initItems();
        window.addEventListener('scroll', this.handleScroll);
    }

    componentDidUpdate(prevProps) {
        if (!_isEqual(this.props.items, prevProps.items)) {
            this.initItems();
        }
    }

    componentWillUnmount() {
        window.removeEventListener('scroll', this.handleScroll);
    }

    handleScroll = () => {
        if (this.scrollByClick) {
            this.saveActiveItems();
        } else {
            this.scrollByClick = true;
        }
    };

    handleSectionClick = (event) => {
        const {onSectionClick} = this.props;

        event.stopPropagation();

        this.scrollByClick = false;

        this.saveActiveItems(event.target.hash);

        if (onSectionClick) {
            onSectionClick(event);
        }
    };

    initItems() {
        const {items} = this.props;
        const targetItems = items
            .map((item) => (document.getElementById(item.slice(1))))
            .filter(Boolean);

        this.setState({targetItems}, this.initSections);
    }

    initSections = () => {
        this.saveActiveItems();
    };

    getViewState(hash) {
        const {targetItems, inViewState} = this.state;
        const {headerOffset} = this.props;
        const visibleAreaHeight = (window.innerHeight - headerOffset) * 0.33;
        const currentOffset = window.pageYOffset;
        const visibleItemOffset = [];
        let isOneActive = false;
        let isOnePseudoActive = false;

        targetItems.forEach((item, index) => {
            if (!item) {
                return;
            }

            const offsetTop = item.getBoundingClientRect().top;
            const isVisibleItem = visibleAreaHeight > offsetTop;

            if (hash) {
                if (hash === `#${item.getAttribute('id')}`) {
                    visibleItemOffset.push(true);
                    isOneActive = true;
                } else {
                    visibleItemOffset.push(false);
                }
            } else if (isVisibleItem) {
                if (visibleItemOffset[index - 1]) {
                    visibleItemOffset[index - 1] = false;
                }

                visibleItemOffset.push(true);
                isOneActive = true;
            } else if (!isOneActive && currentOffset > offsetTop) {
                if (visibleItemOffset[index - 1]) {
                    visibleItemOffset[index - 1] = false;
                }

                visibleItemOffset.push(true);
                isOnePseudoActive = true;
            } else {
                visibleItemOffset.push(false);
            }
        });

        if (targetItems && targetItems.length && !isOneActive && !isOnePseudoActive) {
            if (currentOffset < targetItems[0].getBoundingClientRect().top) {
                visibleItemOffset[0] = true;
                isOneActive = true;
            }
        }

        return isOneActive || isOnePseudoActive ? visibleItemOffset : inViewState;
    }

    saveActiveItems(hash) {
        const visibleItems = this.getViewState(hash);

        this.setState({inViewState: visibleItems});
    }

    render() {
        const {children, currentClassName, className} = this.props;
        const {inViewState} = this.state;

        const items = children.map((child, index) => {
            if (!child) {
                return null;
            }

            const ChildTag = child.type;
            let childClassNames = child.props.className;

            if (inViewState[index] && currentClassName.length > 0) {
                childClassNames += ` ${currentClassName}`;
            }

            return (
                <ChildTag key={child.key} className={childClassNames} onClick={this.handleSectionClick}>
                    {child.props.children}
                </ChildTag>
            );
        });

        return (
            <ul className={className}>
                {items}
            </ul>
        );
    }
}

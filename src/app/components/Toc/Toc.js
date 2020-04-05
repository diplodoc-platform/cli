import React from 'react';
import PropTypes from 'prop-types';
import block from 'bem-cn-lite';
import {parse} from 'url';
import {TextInput} from 'lego-on-react';

//import i18n from 'i18n';
import {HEADER_HEIGHT} from 'constants';
import withRouter from 'hoc/withRouter';

import ToggleArrow from 'components/ToggleArrow/ToggleArrow';
import HTML from 'components/HTML/HTML';

import './Toc.scss';

//const i18nK = i18n.bind(null, 'docs');
const b = block('Toc');

function isActiveItem(router, href) {
    return router.pathname === parse(href).pathname;
}

class Toc extends React.Component {
    static propTypes = {
        router: PropTypes.object.isRequired,
        items: PropTypes.array,
        title: PropTypes.string,
        href: PropTypes.string,
        stage: PropTypes.string,
    };

    constructor(props) {
        super(props);
        this.contentRef = React.createRef();
        this.rootRef = React.createRef();
    }

    state = {
        flatToc: {},
        filteredItemIds: [],
        filterName: '',
        contentScrolled: false,
        activeId: null,
    };

    componentDidMount() {
        this.containerEl = document.querySelector('.Layout__content');
        this.footerEl = document.querySelector('.Layout__footer');
        this.setTocHeight();
        this.setState(this.getState(this.props, this.state), () => this.scrollToActiveItem());

        window.addEventListener('scroll', this.handleScroll);
        window.addEventListener('resize', this.handleResize);
        this.contentRef.current.addEventListener('scroll', this.handleContentScroll);
    }

    componentDidUpdate(prevProps) {
        if (prevProps.router.pathname !== this.props.router.pathname) {
            this.setTocHeight();
            this.setState(this.getState(this.props, this.state), () => this.scrollToActiveItem());
        }
    }

    componentWillUnmount() {
        window.removeEventListener('scroll', this.handleScroll);
        window.removeEventListener('resize', this.handleResize);
        this.contentRef.current.removeEventListener('scroll', this.handleContentScroll);
    }

    getState(props, state) {
        const flatToc = {};
        let activeId;

        function processItems(items, parentId) {
            items.forEach(({id, href, name, items: subItems}) => {
                flatToc[id] = state.flatToc[id] ? {...state.flatToc[id]} : {name, href};

                if (parentId) {
                    flatToc[id].parents = [parentId, ...flatToc[parentId].parents];
                } else {
                    flatToc[id].parents = [];
                }

                if (href && isActiveItem(props.router, href)) {
                    activeId = id;
                }

                if (subItems) {
                    if (typeof flatToc[id].opened === 'undefined') {
                        flatToc[id].opened = flatToc[id].parents.length === 0;
                    }

                    processItems(subItems, id);
                }
            });
        }

        processItems(props.items);

        if (activeId) {
            flatToc[activeId].parents.forEach((id) => {
                flatToc[id].opened = true;
            });
        }

        return {flatToc, activeId};
    }

    setTocHeight() {
        const scrollDiff = window.scrollY + window.innerHeight - HEADER_HEIGHT - this.containerEl.offsetHeight;
        const rootNode = this.rootRef.current;

        if (scrollDiff > 0) {
            rootNode.style.height = window.innerHeight - HEADER_HEIGHT - scrollDiff + 'px';
        } else if (this.containerEl.offsetHeight < window.innerHeight) {
            rootNode.style.height = this.containerEl.offsetHeight + 'px';
        } else {
            rootNode.style.height = window.innerHeight - HEADER_HEIGHT + 'px';
        }
    }

    scrollToActiveItem() {
        const {activeId} = this.state;
        const activeEl = document.getElementById(activeId);

        if (!activeEl) {
            return;
        }

        const itemHeight = activeEl.querySelector('.' + b('list-item-text')).offsetHeight;
        const itemOffset = activeEl.offsetTop;
        const scrollableParent = activeEl.offsetParent;
        const scrollableHeight = scrollableParent.offsetHeight;
        const scrollableOffset = scrollableParent.scrollTop;

        const itemVisible = (
            itemOffset >= scrollableOffset &&
            itemOffset <= scrollableOffset + scrollableHeight - itemHeight
        );

        if (!itemVisible) {
            scrollableParent.scrollTop = itemOffset - Math.floor(scrollableHeight / 2) + itemHeight;
        }
    }

    getVisibleItemIds = (filterName) => {
        const {flatToc} = this.state;
        let filteredItemIds = [];

        if (filterName) {
            const itemIds = Object.keys(flatToc);

            filteredItemIds = itemIds.filter((id) => (
                flatToc[id].name.toLowerCase().includes(filterName.toLowerCase())
            ));
        }

        return filteredItemIds;
    };

    handleScroll = () => {
        this.setTocHeight();
    };

    handleResize = () => {
        this.setTocHeight();
    };

    handleItemClick = (id) => {
        this.setState((prevState) => ({
            flatToc: {
                ...prevState.flatToc,
                [id]: {
                    ...prevState.flatToc[id],
                    opened: !prevState.flatToc[id].opened,
                },
            },
        }));
    };

    handleFilterNameChange = (value) => {
        const filteredItemIds = this.getVisibleItemIds(value);
        let filteredState;

        if (value.length > 0 && filteredItemIds.length !== 0) {
            filteredState = {
                filterName: value,
                filteredItemIds,
            };
        } else {
            filteredState = {
                filterName: value,
                filteredItemIds: [],
            };
        }

        this.setState(filteredState);
    };

    handleContentScroll = () => {
        const contentNode = this.contentRef.current;
        const contentScrolled = contentNode.scrollTop > 0;
        if (contentScrolled !== this.state.contentScrolled) {
            this.setState({contentScrolled});
        }
    };

    renderList(items, isMain = true) {
        const {flatToc, filteredItemIds, filterName, activeId} = this.state;

        return (
            <ul className={b('list')}>
                {items.map(({id, name, href, items: subItems}, index) => {
                    const opened = flatToc[id] ? flatToc[id].opened : true;
                    let isOpenFilteredItem = false;
                    let active = false;
                    let visibleChildren = subItems;
                    let icon = null;
                    let text;

                    if (filteredItemIds.length > 0) {
                        filteredItemIds.forEach((itemId) => {
                            if (flatToc[itemId].parents.includes(id)) {
                                isOpenFilteredItem = true;
                            }
                        });
                    }

                    if (subItems && subItems.length > 0) {
                        icon = <ToggleArrow className={b('list-item-icon')} open={opened} thin={true}/>;
                    }

                    if (filteredItemIds.includes(id)) {
                        const firstEntry = name.toLowerCase().indexOf(filterName.toLowerCase());
                        isOpenFilteredItem = true;

                        text = (
                            <React.Fragment>
                                {name.substring(0, firstEntry)}
                                <span className={b('list-item-text-match')}>
                                    {name.substring(firstEntry, firstEntry + filterName.length)}
                                </span>
                                {name.substring(firstEntry + filterName.length)}
                            </React.Fragment>
                        );
                    } else {
                        text = <span>{name}</span>;
                    }

                    let content = (
                        <div
                            className={b('list-item-text')}
                            onClick={subItems && subItems.length > 0 ? this.handleItemClick.bind(this, id) : null}
                        >
                            {icon}
                            {text}
                        </div>
                    );

                    if (filterName.length > 0 && !isOpenFilteredItem) {
                        return null;
                    }

                    // TODO @lunory: проверять детей, когда оторвут href'ы
                    if (href) {
                        content = (
                            <a href={href} className={b('list-item-link')} data-router-shallow>{content}</a>
                        );

                        active = id === activeId;
                    }

                    if (subItems && (active || opened)) {
                        visibleChildren = true;
                    }

                    return (
                        <li key={index} id={id} className={b('list-item', {main: isMain, active, opened})}>
                            {content}
                            {subItems && visibleChildren && this.renderList(subItems, false)}
                        </li>
                    );
                })}
            </ul>
        );
    }

    renderEmpty(text) {
        return <div className={b('empty')}>{text}</div>;
    }

    renderTop() {
        const {router, title, href} = this.props;
        let topHeader;

        if (href) {
            const active = isActiveItem(router, href);

            topHeader = (
                <a href={href} className={b('top-header', {active, link: true})} data-router-shallow>
                    <HTML>{title}</HTML>
                </a>
            );
        } else {
            topHeader = <div className={b('top-header')}><HTML>{title}</HTML></div>;
        }

        return (
            <div className={b('top')}>
                {topHeader}
                <div className={b('top-filter')}>
                    <TextInput
                        cls={b('top-filter-input')}
                        theme="normal"
                        view="default"
                        tone="default"
                        size="n"
                        text={this.state.filterName}
                        //placeholder={i18nK('label_toc-filter-placeholder')}
                        onChange={this.handleFilterNameChange}
                    />
                </div>
            </div>
        );
    }

    render() {
        const {items} = this.props;
        const {filterName, filteredItemIds, contentScrolled} = this.state;
        let content;

        if (filterName.length !== 0 && filteredItemIds.length === 0) {
            // TODO @lunory: сделать ссылку на консоль, если надо
            content = this.renderEmpty('');
        } else {
            content = items ? this.renderList(items) : this.renderEmpty('');
        }

        return (
            <div className={b()} ref={this.rootRef}>
                {this.renderTop()}
                <div className={b('content', {scrolled: contentScrolled})} ref={this.contentRef}>
                    {content}
                </div>
            </div>
        );
    }
}

export default withRouter(Toc);

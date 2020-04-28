import React from 'react';
import block from 'bem-cn-lite';
import 'yfm-transform/dist/js/yfm';

//TODO(vladimirfedin): Add support of i18n

import DocLayout from 'components/DocLayout/DocLayout';
import DocPageTitle from 'components/DocPageTitle/DocPageTitle';
import Breadcrumbs from 'components/Breadcrumbs/Breadcrumbs';
import MiniToc from 'components/MiniToc/MiniToc';
import HTML from 'components/HTML/HTML';

import GithubIcon from 'assets/icons/github.svg';

import 'yfm-transform/dist/css/yfm.css';
import './DocPage.scss';

const b = block('DocPage');

export class DocPage extends React.Component {
    renderBreadcrumbs() {
        const {breadcrumbs} = this.props;

        if (!breadcrumbs || breadcrumbs.length === 0) {
            return null;
        }

        return (
            <div className={b('breadcrumbs')}>
                <Breadcrumbs items={breadcrumbs}/>
            </div>
        );
    }

    renderTitle() {
        const {title, meta} = this.props;

        if (!title) {
            return null;
        }

        return (
            <DocPageTitle stage={meta.stage || {}} className={b('title')}>
                <HTML>{title}</HTML>
            </DocPageTitle>
        );
    }

    renderContentMiniToc() {
        const {headings} = this.props;

        return (
            <div className={b('content-mini-toc', 'yfm')}>
                <ul>
                    {headings.map(({title, href, level, items}, index) => {
                        if (level !== 2) {
                            return null;
                        }

                        return (
                            <li key={index}>
                                <a href={href}>{title}</a>
                                {items && (
                                    <ul>
                                        {items.map(({
                                            title: itemTitle, href: itemHref, level: itemLevel,
                                        }, idx) => {
                                            if (itemLevel !== 3) {
                                                return null;
                                            }

                                            return (
                                                <li key={idx}>
                                                    <a href={itemHref}>{itemTitle}</a>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                )}
                            </li>
                        );
                    })}
                </ul>
            </div>
        );
    }

    renderBody() {
        const {html} = this.props;

        if (!html) {
            return null;
        }

        return <div className={b('body', 'yfm')} dangerouslySetInnerHTML={{__html: html}}/>;
    }

    renderAsideLinks() {
        const {toc, meta, githubUrl} = this.props;
        const editable = (
            toc.stage !== 'preview' &&
            meta.stage !== 'preview' &&
            meta.editable !== false &&
            toc.editable !== false
        );
        const iconSize = 24;

        if (!editable || !githubUrl) {
            return null;
        }

        return (
            <ul className={b('aside-links')}>
                <li className={b('aside-links-item')}>
                    <a
                        href={githubUrl}
                        target="_blank"
                        rel="noreferrer noopener"
                        className={b('aside-link')}
                    >
                        <GithubIcon className={b('aside-link-icon')} width={iconSize} height={iconSize}/>
                        {
                            // TODO(vladimirfedin) Add github link
                            //i18n('docs', 'label_link-github')
                            'Редактировать на GitHub'
                        }
                    </a>
                </li>
            </ul>
        );
    }

    renderAsideMiniToc() {
        const {headings} = this.props;

        if (headings.length === 0) {
            return null;
        }

        return (
            <div className={b('aside-mini-toc')}>
                <MiniToc headings={headings}/>
            </div>
        );
    }

    renderAsideSeparator() {
        return <div className={b('aside-separator')}/>;
    }

    render() {
        const {toc} = this.props;

        const asideLinks = this.renderAsideLinks();
        const asideMiniToc = this.renderAsideMiniToc();

        return (
            <DocLayout toc={toc} className={b()}>
                <DocLayout.Center>
                    <div className={b('main')}>
                        {this.renderBreadcrumbs()}
                        <main className={b('content')}>
                            {this.renderTitle()}
                            {this.renderContentMiniToc()}
                            {this.renderBody()}
                        </main>
                        {/* {this.renderFeedback()} */}
                    </div>
                </DocLayout.Center>
                <DocLayout.Right>
                    <div className={b('aside')}>
                        {asideLinks}
                        {asideLinks && asideMiniToc && this.renderAsideSeparator()}
                        {asideMiniToc}
                    </div>
                </DocLayout.Right>
            </DocLayout>
        );
    }
}

export default DocPage;

import React from 'react';
import block from 'bem-cn-lite';

import DocLayout from '../DocLayout/DocLayout';
import DocPageTitle from '../DocPageTitle/DocPageTitle';
import Text from '../Text/Text';
import HTML from '../HTML/HTML';

import './DocLeadingPage.scss';

const b = block('DocLeadingPage');

export class DocLeadingPage extends React.Component {
    render() {
        const {data: {title, description, links}, toc} = this.props;

        return (
            <DocLayout toc={toc} className={b()}>
                <DocLayout.Center>
                    <main className={b('main')}>
                        <DocPageTitle stage={toc.stage} className={b('title')}>
                            <HTML>{title}</HTML>
                        </DocPageTitle>
                        <div className={b('description')}>
                            <Text data={description} html block/>
                        </div>
                        <ul className={b('links')}>
                            {links.map(({title: linkTitle, description: linkDescription, href}, index) => (
                                <li key={index} className={b('links-item')}>
                                    <h2 className={b('links-title')}>
                                        <a href={href} className={b('links-link')}>{linkTitle}</a>
                                    </h2>
                                    <p className={b('links-description')}>{linkDescription}</p>
                                </li>
                            ))}
                        </ul>
                    </main>
                </DocLayout.Center>
            </DocLayout>
        );
    }
}

export default DocLeadingPage;

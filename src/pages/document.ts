import type {DocInnerProps, DocPageData} from '@diplodoc/client/ssr';
import type {Resources} from '~/core/meta';

import {join} from 'path';
import {isEmpty} from 'lodash';
import {dedent} from 'ts-dedent';
import {render} from '@diplodoc/client/ssr';
import manifest from '@diplodoc/client/manifest';

import {Template} from '~/core/template';

import {BUNDLE_FOLDER, DEFAULT_CSP_SETTINGS} from '../constants';

type Meta = Resources & {
    metadata: Hash<string>[];
};

const rebase = (url: string) => join(BUNDLE_FOLDER, url);

export function generateStaticMarkup(
    path: RelativePath,
    props: DocInnerProps<DocPageData>,
    toc: NormalizedPath,
    title: string,
): string {
    const {lang, search, data} = props;
    const {
        style = [],
        script = [],
        csp,
        metadata = [],
        ...restYamlConfigMeta
    } = (data.meta as Meta) || {};
    const staticContent = Boolean(data.toc);

    const html = staticContent ? render(props) : '';
    const template = new Template(path, lang);

    template.setTitle(title);
    template.addBody(`<div id="root">${html}</div>`);

    if (csp && !isEmpty(csp)) {
        template.addCsp(DEFAULT_CSP_SETTINGS);
        csp.map(template.addCsp);
    }

    metadata.map(template.addMeta);

    Object.entries(restYamlConfigMeta)
        .map(([name, content]) => ({name, content}))
        .map(template.addMeta);

    manifest.app.css
        .filter((file: string) => template.isRTL === file.includes('.rtl.css'))
        .map(rebase)
        .map(template.addStyle);

    style.map(template.addStyle);

    template.addScript(template.escape(JSON.stringify(props)), {
        inline: true,
        position: 'leading',
        attrs: {
            type: 'application/json',
            id: 'diplodoc-state',
        },
    });
    template.addScript(
        dedent`
            const data = document.querySelector('script#diplodoc-state');
            window.__DATA__ = JSON.parse((${template.unescape.toString()})(data.innerText));
            window.STATIC_CONTENT = ${staticContent};
        `,
        {
            inline: true,
            position: 'leading',
        },
    );

    if (!staticContent) {
        template.addScript(toc + '.js');
    }

    manifest.app.js.map(rebase).map(template.addScript);

    script.map(template.addScript);

    // TODO: move to search extension
    if (search?.resources) {
        template.addScript(search.resources);
    }

    return template.dump();
}

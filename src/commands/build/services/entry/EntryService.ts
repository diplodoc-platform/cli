import type {Meta} from '~/core/meta';
import type {Toc} from '~/core/toc';
import type {Run} from '~/commands/build';
import type {EntryData, PageData, PageState} from './types';

import {extname, join} from 'node:path';
import {isEmpty} from 'lodash';
import {dedent} from 'ts-dedent';
import {render} from '@diplodoc/client/ssr';
import manifest from '@diplodoc/client/manifest';

import {Template} from '~/core/template';
import {VFile, copyJson, getDepth, getDepthPath, langFromPath, setExt} from '~/core/utils';
import {BUNDLE_FOLDER, DEFAULT_CSP_SETTINGS} from '~/constants';

import {getHooks, withHooks} from './hooks';

const rebase = (url: string) => join(BUNDLE_FOLDER, url);

@withHooks
export class EntryService {
    private run: Run;

    private config: Run['config'];

    constructor(run: Run) {
        this.run = run;
        this.config = run.config;
    }

    async load(path: NormalizedPath) {
        // Add generator meta tag with versions
        this.run.meta.add(path, {
            metadata: {
                generator: `Diplodoc Platform v${VERSION}`,
            },
        });

        const type = extname(path).slice(1);
        const result = {type, path} as EntryData;

        if (type === 'yaml') {
            const vfile = await this.run.leading.dump(path);

            result.content = vfile;
            result.info = vfile.info;
        } else {
            const vfile = await this.run.markdown.dump(path);

            result.content = vfile;
            result.info = vfile.info;
        }

        result.meta = await this.run.meta.dump(path);

        return result;
    }

    async dump(path: NormalizedPath, entry?: EntryData): Promise<VFile<EntryData>> {
        entry = entry || (await this.load(path));

        const vfile = new VFile(path, entry, () => (entry as EntryData).content.toString());

        await getHooks(this).Dump.promise(vfile);

        return vfile;
    }

    async state(path: NormalizedPath, data: PageData) {
        const {langs, analytics, interface: viewerInterface} = this.config;
        const lang = langFromPath(path, this.config);

        const state: PageState = {
            data,
            router: {
                pathname: setExt(path, ''),
                // TODO: remove in favor of base
                depth: getDepth(path),
                base: getDepthPath(getDepth(path) - 1),
            },
            lang,
            langs,
            analytics,
            viewerInterface,
        };

        await getHooks(this).State.promise(state);

        return state;
    }

    async page(template: Template, state: PageState, toc: Toc) {
        const {staticContent} = this.config;
        const title = getTitle(toc.title as string, state.data.title);
        const {
            style = [],
            script = [],
            csp,
            metadata = [],
            ...restYamlConfigMeta
        } = (state.data.meta as Meta) || {};

        const faviconSrc = state.viewerInterface?.faviconSrc || '';

        const html = staticContent
            ? render({
                  ...state,
                  data: {
                      ...state.data,
                      // TODO: stop to modify toc in client code. Omit copyJson here.
                      toc: copyJson(toc),
                  },
              })
            : '';

        template.setTitle(title);
        template.addBody(`<div id="root">${html}</div>`);
        template.setFaviconSrc(faviconSrc);

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

        template.addScript(template.escape(JSON.stringify(state)), {
            inline: true,
            position: 'state',
            attrs: {
                type: 'application/json',
                id: 'diplodoc-state',
            },
        });
        template.addScript(
            dedent`
                const data = document.querySelector('script#diplodoc-state');
                window.__DATA__ = JSON.parse((function ${template.unescape.toString()})(data.innerText));
                window.STATIC_CONTENT = ${staticContent};
            `,
            {
                inline: true,
                position: 'state',
            },
        );

        manifest.app.js.map(rebase).map(template.addScript);

        script.map(template.addScript);

        await getHooks(this).Page.promise(template);

        return template.dump();
    }
}

function getTitle(tocTitle: string, dataTitle: string) {
    if (dataTitle && tocTitle) {
        return `${dataTitle} | ${tocTitle}`;
    }

    return tocTitle || dataTitle || '';
}

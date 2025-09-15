import type {Meta} from '~/core/meta';
import type {Toc} from '~/core/toc';
import type {GraphInfo as MarkdownGraphInfo} from '~/core/markdown';
import type {GraphInfo as LeadingGraphInfo} from '~/core/leading';
import type {EntryInfo, Run} from '~/commands/build';
import type {EntryData, PageData, PageState} from './types';

import {extname, join} from 'node:path';
import {isEmpty} from 'lodash';
import {dedent} from 'ts-dedent';
import {render} from '@diplodoc/client/ssr';
import manifest from '@diplodoc/client/manifest';

import {Template} from '~/core/template';
import {Graph, VFile, copyJson, getDepth, getDepthPath, langFromPath, setExt} from '~/core/utils';
import {BUNDLE_FOLDER, DEFAULT_CSP_SETTINGS, VERSION} from '~/constants';

import {getHooks, withHooks} from './hooks';

const rebase = (url: string) => join(BUNDLE_FOLDER, url);

const excludedMetaFields = [
    'interface',
    'resources',
    'contributors',
    'author',
    'updatedAt',
    'sourcePath',
    'vcsPath',
    'noIndex',
];

function isPublicMeta(record: {name?: string}) {
    return record.name && !excludedMetaFields.includes(record.name);
}

@withHooks
export class EntryService {
    readonly relations = new Graph<MarkdownGraphInfo | LeadingGraphInfo>();

    private run: Run;

    private config: Run['config'];

    constructor(run: Run) {
        this.run = run;
        this.config = run.config;
    }

    async dump(path: NormalizedPath, entry?: EntryData): Promise<VFile<EntryData, EntryInfo>> {
        entry = entry || (await this.load(path));

        const vfile = new VFile<EntryData, EntryInfo>(path, entry, () =>
            (entry as EntryData).content.toString(),
        );
        vfile.info.entryGraph = entry.info.entryGraph;
        vfile.info.varsGraph = entry.info.varsGraph;

        await getHooks(this).Dump.promise(vfile);

        return vfile;
    }

    release(path: NormalizedPath, from?: NormalizedPath) {
        const service = this.getService(path);
        return service.release(path, from);
    }

    async state(path: NormalizedPath, data: PageData) {
        const {langs, analytics, interface: baseInterface} = this.config;
        const lang = langFromPath(path, this.config);
        const {interface: metaInterface} = data.meta;

        const viewerInterface = {
            ...(baseInterface ?? {}),
            ...(metaInterface ?? {}),
        };

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
        const {
            style = [],
            script = [],
            csp: baseCsp,
            metadata = [],
            title: metaTitle,
            description,
            resources: metaResources,
            ...restYamlConfigMeta
        } = (state.data.meta as Meta) || {};

        const baseTitle = metaTitle || state.data.title;
        const title = getTitle(toc.title as string, baseTitle);
        const faviconSrc = state.viewerInterface?.['favicon-src'] || '';
        const metaCsp = metaResources?.csp;

        const csp = [...(baseCsp || []), ...(metaCsp || [])];

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

        if (description && !metadata.some((meta: Hash) => meta.name === 'description')) {
            metadata.push({name: 'description', content: description});
        }

        metadata.filter(isPublicMeta).map(template.addMeta);

        Object.entries(restYamlConfigMeta)
            .map(([name, content]) => ({name, content}))
            .filter(isPublicMeta)
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

    isSource(path: NormalizedPath) {
        if (!this.relations.hasNode(path)) {
            return false;
        }

        const {type} = this.relations.getNodeData(path) || {};

        return type === 'source';
    }

    isResource(path: NormalizedPath) {
        if (!this.relations.hasNode(path)) {
            return false;
        }

        const {type} = this.relations.getNodeData(path) || {};

        return type === 'resource';
    }

    private async load(path: NormalizedPath) {
        // Add generator meta tag with versions
        this.run.meta.add(path, {
            metadata: {
                generator: `Diplodoc Platform v${VERSION}`,
            },
        });

        const type = extname(path).slice(1);
        const result = {type, path} as EntryData;

        const service = this.getService(path);
        const vfile = await service.dump(path);
        const entryGraph = await service.relations(path);
        const varsGraph = await this.run.vars.relations.extract(path);

        result.content = vfile;
        result.info = {
            ...vfile.info,
            entryGraph,
            varsGraph,
        };
        result.meta = await this.run.meta.dump(path);

        return result;
    }

    private getService(path: NormalizedPath) {
        const type = extname(path).slice(1);

        if (type === 'yaml') {
            return this.run.leading;
        } else {
            return this.run.markdown;
        }
    }
}

function getTitle(tocTitle: string, dataTitle: string) {
    if (dataTitle && tocTitle) {
        return `${dataTitle} | ${tocTitle}`;
    }

    return tocTitle || dataTitle || '';
}

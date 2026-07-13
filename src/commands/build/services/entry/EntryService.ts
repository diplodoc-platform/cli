import type {Meta} from '~/core/meta';
import type {Toc} from '~/core/toc';
import type {GraphInfo as MarkdownGraphInfo} from '~/core/markdown';
import type {GraphInfo as LeadingGraphInfo} from '~/core/leading';
import type {EntryInfo, Run} from '~/commands/build';
import type {EntryData, PageData, PageState} from './types';
import type {Template} from '~/core/template';

import {extname, join} from 'node:path';
import {isEmpty} from 'lodash';
import {dedent} from 'ts-dedent';
import {render} from '@diplodoc/client/ssr';

import {Graph, VFile, copyJson, getDepth, getDepthPath, langFromPath, setExt} from '~/core/utils';
import {BUNDLE_FOLDER, DEFAULT_CSP_SETTINGS, THEME_ASSETS_PATH, VERSION} from '~/constants';

import {getHooks, withHooks} from './hooks';
import {getTitle} from './utils/seo';

const rebase = (url: string) => join(BUNDLE_FOLDER, url);

const excludedMetaFields = [
    'interface',
    'neuroExpert',
    'resources',
    'contributors',
    'author',
    'updatedAt',
    'sourcePath',
    'vcsPath',
    'noIndex',
    'canonical',
    'alternate',
    'restricted-access',
];

function isPublicMeta(record: {name?: string; property?: string}) {
    return (
        (record.name && !excludedMetaFields.includes(record.name)) ||
        (record.property && !excludedMetaFields.includes(record.property))
    );
}

function stripUnresolvedVars(str: string): string {
    if (typeof str !== 'string') return str;
    const parts = str.split('{{');
    let result = parts[0];
    for (let i = 1; i < parts.length; i++) {
        const closeIdx = parts[i].indexOf('}}');
        result += closeIdx !== -1 ? parts[i].substring(closeIdx + 2) : parts[i];
    }
    return result.replace(/\s+/g, ' ').trim();
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
        const {langs, analytics, interface: baseInterface, feedback, pdf} = this.config;
        const lang = langFromPath(path, this.config);
        const {interface: metaInterface} = data.meta;

        const viewerInterface = {
            ...(baseInterface ?? {}),
            ...(metaInterface ?? {}),
        };

        const pdfLink = pdf?.pdfFileUrl;
        const pdfIconConfig =
            pdf?.icon !== undefined || pdf?.position !== undefined || pdf?.size !== undefined
                ? {
                      ...(pdf.icon !== undefined && {icon: pdf.icon}),
                      ...(pdf.position !== undefined && {position: pdf.position}),
                      ...(pdf.size !== undefined && {size: pdf.size}),
                  }
                : undefined;

        const state: PageState = {
            data: {
                ...data,
                ...(pdfLink !== undefined && {pdfLink}),
                ...(pdfIconConfig !== undefined && {pdfIconConfig}),
            },
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
            feedback,
        };

        await getHooks(this).State.promise(state);

        return state;
    }

    async page(template: Template, state: PageState, toc: Toc) {
        const {staticContent, resources} = this.config;
        const {
            style = [],
            script = [],
            csp: metaCsp,
            metadata = [],
            title: metaTitle,
            description,
            canonical = '',
            alternate = [],
            __metadata = [],
            ...restYamlConfigMeta
        } = (state.data.meta as Meta) || {};

        const baseTitle = metaTitle || state.data.title;
        const title = getTitle(toc.title as string, baseTitle);
        const faviconSrc = state.viewerInterface?.['favicon-src'] || '';

        const baseCsp = resources?.csp;

        const csp = [...(baseCsp || []), ...(metaCsp || [])];

        const html = staticContent
            ? render({
                  ...state,
                  // PageState.search is { enabled: boolean } & Hash, but render expects full SearchConfig
                  // with properties: depth, api, link, lang. Type assertion needed for compatibility.
                  search: state.search as Parameters<typeof render>[0]['search'],
                  // TODO: https://github.com/diplodoc-platform/cli/issues/1433
                  // @ts-ignore
                  data: {
                      ...state.data,
                      // TODO: stop to modify toc in client code. Omit copyJson here.
                      // @ts-ignore
                      toc: copyJson(toc),
                  },
              } as Parameters<typeof render>[0])
            : '';

        template.setTitle(stripUnresolvedVars(title));
        template.addBody(`<div id="root">${html}</div>`);
        template.setFaviconSrc(faviconSrc);
        template.setCanonical(stripUnresolvedVars(canonical));

        template.addAlternates(
            alternate.map((a: {href: string; hreflang?: string}) => ({
                ...a,
                href: stripUnresolvedVars(a.href),
            })),
        );

        if (csp && !isEmpty(csp)) {
            template.addCsp(DEFAULT_CSP_SETTINGS);
            csp.map(template.addCsp);
        }

        if (description && !metadata.some((meta: Hash) => meta.name === 'description')) {
            metadata.push({name: 'description', content: stripUnresolvedVars(description)});
        }

        if (restYamlConfigMeta.updatedAt) {
            template.addMeta({
                'http-equiv': 'last-modified',
                content: restYamlConfigMeta.updatedAt,
            });
            template.addMeta({
                property: 'article:modified_time',
                content: restYamlConfigMeta.updatedAt,
            });
        }

        metadata
            .filter(isPublicMeta)
            .map((m: Hash) => ({...m, content: stripUnresolvedVars(m.content)}))
            .forEach(template.addMeta);

        (Array.isArray(__metadata) ? __metadata : [])
            .filter(isPublicMeta)
            .map((m: Hash) => ({...m, content: stripUnresolvedVars(m.content)}))
            .forEach(template.addMeta);

        if (Array.isArray(restYamlConfigMeta.keywords)) {
            this.normalizeKeywords(restYamlConfigMeta);

            if (state.data?.meta) {
                state.data.meta.keywords = restYamlConfigMeta.keywords;
            }
        }

        Object.keys(restYamlConfigMeta).forEach((key) => {
            const value = restYamlConfigMeta[key];

            if (Array.isArray(value) && value.every((item) => typeof item === 'string')) {
                restYamlConfigMeta[key] = value.join(',');
            }
        });

        Object.entries(restYamlConfigMeta)
            .filter(([, content]) => typeof content === 'string')
            .map(([name, content]) => ({
                name,
                content: stripUnresolvedVars(content as string),
            }))
            .filter(isPublicMeta)
            .map(template.addMeta);

        this.run.manifest.app.css
            .filter((file: string) => template.isRTL === file.includes('.rtl.css'))
            .map(rebase)
            .map(template.addStyle);

        const outputThemePath = join(this.run.output, THEME_ASSETS_PATH);

        if (this.run.exists(outputThemePath)) {
            template.addStyle(THEME_ASSETS_PATH);
        }

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

        this.run.manifest.app.js.map(rebase).map(template.addScript);

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

        if (this.config.addAlternateMeta) {
            const canonical = setExt(path, 'html');
            const alternate = this.run.alternates(path);
            if (alternate.length > 0) {
                this.run.meta.add(path, {canonical, alternate});
            }
        }

        const service = this.getService(path);
        const vfile = await service.dump(path);
        const entryGraph = await service.relations(path);
        const varsGraph = this.run.vars.relations.extract(path);

        return {
            type: extname(path).slice(1),
            path,
            content: vfile,
            info: {
                ...vfile.info,
                entryGraph,
                varsGraph,
            },
            meta: await this.run.meta.dump(path),
        } as EntryData;
    }

    private getService(path: NormalizedPath) {
        const type = extname(path).slice(1);

        if (type === 'yaml') {
            return this.run.leading;
        } else {
            return this.run.markdown;
        }
    }

    private normalizeKeywords(meta: Hash): void {
        if (!Array.isArray(meta.keywords)) {
            return;
        }

        meta.keywords = this.cleanKeywords(meta.keywords).join(', ');
    }

    private cleanKeywords(content: any) {
        if (!Array.isArray(content)) {
            return content;
        }

        return content
            .map((k: any) => {
                let rawValue = typeof k === 'object' && k && 'keyword' in k ? k.keyword : k;

                if (Array.isArray(rawValue)) {
                    rawValue = rawValue.join(' ');
                }

                if (
                    rawValue === null ||
                    rawValue === undefined ||
                    (typeof rawValue === 'object' && !Object.keys(rawValue).length)
                ) {
                    return '';
                }

                const strValue = String(rawValue);

                const parts = strValue.split('{{');
                let cleanStr = parts[0];
                for (let i = 1; i < parts.length; i++) {
                    const closeIdx = parts[i].indexOf('}}');
                    if (closeIdx !== -1) {
                        cleanStr += parts[i].substring(closeIdx + 2);
                    } else {
                        cleanStr += parts[i];
                    }
                }

                return cleanStr.replace('[', '').replace(']', '').replace(/\s+/g, ' ').trim();
            })
            .filter((str) => typeof str === 'string' && str.length > 0);
    }
}

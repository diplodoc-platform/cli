import type {Run} from '~/core/run';
import type {HTMLElement} from 'node-html-parser';

import {extname, join, sep} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import parse from 'node-html-parser';

import {inside} from '../overlay';

const attributes = [
    ['iframe', 'src'],
    ['img', 'src'],
    ['video', 'src'],
    ['video', 'poster'],
    ['audio', 'src'],
    ['source', 'src'],
    ['track', 'src'],
    ['script', 'src'],
    ['embed', 'src'],
    ['object', 'data'],
    ['link', 'href'],
] as const;

/** Collect static resource declarations in native HTML fragments and selected local HTML files. */
export class HtmlResources {
    private visited = new Set<string>();

    private readonly run: Pick<Run, 'input' | 'exists' | 'read'>;

    private readonly probe: (path: string) => void;

    private readonly unsupported: (message: string) => never;

    constructor(
        run: Pick<Run, 'input' | 'exists' | 'read'>,
        probe: (path: string) => void,
        unsupported: (message: string) => never,
    ) {
        this.run = run;
        this.probe = probe;
        this.unsupported = unsupported;
    }

    async collect(html: string, page: string) {
        const root = parse(html);
        let base = pathToFileURL(join(this.run.input, page));
        const baseHref = root
            .querySelectorAll('base[href]')
            .find((element) => !element.closest('template'))
            ?.getAttribute('href');
        if (baseHref) base = this.url(baseHref, base) || base;
        this.assertSupported(root, page);
        const files = new Map<string, boolean>();
        for (const [tag, attribute] of attributes) {
            for (const element of root.querySelectorAll(`${tag}[${attribute}]`)) {
                if (element.closest('template')) continue;
                if (
                    tag === 'link' &&
                    !/(?:^|\s)(?:stylesheet|icon|preload|modulepreload)(?:\s|$)/i.test(
                        element.getAttribute('rel') || '',
                    )
                )
                    continue;
                const href = element.getAttribute(attribute)?.trim();
                if (!href || href.startsWith('#')) continue;
                const url = this.url(href, base);
                if (!url || url.protocol !== 'file:') continue;
                const file = fileURLToPath(url);
                if (!inside(this.run.input, file)) {
                    throw new Error(
                        `Local HTML resource escapes the input directory in ${page}: ${href}`,
                    );
                }
                files.set(file, files.get(file) || ['iframe', 'object', 'embed'].includes(tag));
            }
        }
        for (const [file, document] of files) {
            this.probe(file);
            if (!document || !/\.html?$/i.test(extname(file)) || this.visited.has(file)) continue;
            this.visited.add(file);
            // Native builds may retain missing resource URLs; preserve that behavior.
            if (!this.run.exists(file as AbsolutePath)) continue;
            const content = await this.run.read(file as AbsolutePath);
            await this.collect(content, file.slice(this.run.input.length + 1));
        }
    }

    private assertSupported(root: HTMLElement, page: string) {
        for (const element of root.querySelectorAll(
            'img[srcset], source[srcset], link[imagesrcset]',
        )) {
            if (element.closest('template')) continue;
            if ((element.getAttribute('srcset') || element.getAttribute('imagesrcset'))?.trim()) {
                this.unsupported(
                    `Prepare does not support HTML srcset or imagesrcset resource declarations in ${page}; use explicit resource URLs`,
                );
            }
        }
    }

    private url(href: string, base: URL) {
        href = href.replace(/\\/g, '/');
        if (base.protocol === 'file:' && href.startsWith('/') && !href.startsWith('//')) {
            const rooted = new URL(href, 'https://prepare.invalid');
            return new URL(
                `.${rooted.pathname}${rooted.search}${rooted.hash}`,
                pathToFileURL(this.run.input + sep),
            );
        }
        try {
            return new URL(href.startsWith('//') ? `https:${href}` : href, base);
        } catch {
            // Keep native handling of invalid URLs and opaque external base URLs.
            return undefined;
        }
    }
}

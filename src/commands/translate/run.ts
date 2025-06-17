import type {TranslateConfig} from './index';
import type {ExtractConfig} from './commands/extract';

import {Run as BaseRun} from '~/core/run';
import {Config} from '~/core/config';
import {VarsService} from '~/core/vars';
import {MetaService} from '~/core/meta';
import {Toc, TocService} from '~/core/toc';
import {MarkdownService} from '~/core/markdown';
import {extname, join, resolve} from 'node:path';
import {FileLoader, resolveFiles} from './utils';
import {isMainThread} from 'node:worker_threads';
import {ConfigDefaults} from './utils/config';

type CommonRunConfig = Omit<TranslateConfig, 'provider'> & ExtractConfig & ConfigDefaults;

export class Run extends BaseRun<CommonRunConfig> {
    readonly vars: VarsService;
    readonly meta: MetaService;
    readonly toc: TocService;
    readonly markdown: MarkdownService;
    readonly tocYamlList: Set<string>;

    constructor(config: Config<CommonRunConfig>) {
        super(config);

        this.scopes.set('input', config.input);
        this.scopes.set('output', config.output);
        const sourcePath = join(config.input, config.source.language) as AbsolutePath;
        this.scopes.set('source', sourcePath);

        this.vars = new VarsService(this, {usePresets: false});
        this.meta = new MetaService(this);
        this.toc = new TocService(this);
        this.markdown = new MarkdownService(this);
        this.tocYamlList = new Set<NormalizedPath>();
    }

    async prepareRun() {
        await this.vars.init();
        await this.markdown.init();

        if (isMainThread) {
            const tocs = await this.glob('**/toc.yaml', {
                cwd: this.input,
            });

            for (const toc of tocs) {
                this.tocYamlList.add(toc);
            }

            await this.toc.init(Array.from(this.tocYamlList) as NormalizedPath[]);
        }
    }

    async getFiles() {
        const allFiles = new Set<NormalizedPath>();

        for (const entry of this.toc.entries) {
            allFiles.add(entry);
        }

        for (const entry of this.toc.entries) {
            try {
                const deps = await this.markdown.deps(entry as RelativePath);

                for (const dep of deps) {
                    if (dep.path.endsWith('.md')) {
                        allFiles.add(dep.path);
                    }
                }
            } catch (error) {
                this.logger.warn(error);
                allFiles.delete(entry);
            }
        }

        const allFilesArray = Array.from([...allFiles, ...this.tocYamlList]);

        return resolveFiles(
            this.config.input,
            this.config.files,
            this.config.include,
            this.config.exclude,
            this.config.source.language,
            ['.md', '.yaml'],
            this.config.filter ? allFilesArray : null,
        );
    }

    async getFileContent(file: NormalizedPath) {
        const type = extname(file).slice(1);

        if (type === 'md') {
            return this.markdown.load(file);
        }

        if (this.tocYamlList.has(file)) {
            const toc: Partial<Toc> = this.toc.for(file);

            delete toc.path;

            return toc;
        }

        const path = resolve(this.config.input, file);

        const loader = new FileLoader(path);

        return loader.load();
    }

    getTocRemovedEntries() {
        return this.toc.removedEntries;
    }
}

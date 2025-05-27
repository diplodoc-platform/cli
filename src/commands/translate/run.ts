import type {TranslateConfig} from './index';
import type {ExtractConfig} from './commands/extract';

import {Run as BaseRun} from '~/core/run';
import {Config} from '~/core/config';
import {VarsService} from '~/core/vars';
import {MetaService} from '~/core/meta';
import {TocService} from '~/core/toc';
import {MarkdownService} from '~/core/markdown';
import {basename, dirname, join} from 'node:path';
import {resolveFiles} from './utils';
import {isMainThread} from 'node:worker_threads';
import {ConfigDefaults} from './utils/config';
import { dump } from 'js-yaml';

type CommonRunConfig = Omit<TranslateConfig, 'provider'> & ExtractConfig & ConfigDefaults;

export class Run extends BaseRun<CommonRunConfig> {
    readonly vars: VarsService;
    readonly meta: MetaService;
    readonly toc: TocService;
    readonly markdown: MarkdownService;
    readonly tocYamlList: Set<string>;
    private tempTocPath: AbsolutePath;


    constructor(config: Config<CommonRunConfig>) {
        super(config);

        this.scopes.set('input', config.input);
        this.scopes.set('output', config.output);
        const sourcePath = join(config.input, config.source.language) as AbsolutePath;
        // const outputPath = join(config.output, config.source.language) as AbsolutePath;
        this.scopes.set('source', sourcePath);
        this.tempTocPath = join(config.input);

        this.vars = new VarsService(this, {usePresets: false});
        this.meta = new MetaService(this);
        this.toc = new TocService(this);
        this.markdown = new MarkdownService(this);
        this.tocYamlList = new Set();
    }

    async prepareRun() {
        await this.vars.init();
        await this.markdown.init();

        if (isMainThread) {
            const tocs = await this.glob('**/toc.yaml', {
                cwd: this.input,
            });

            for (const toc of tocs) {
                const loadedToc = await this.toc.load(toc);

                if (!loadedToc) {
                    continue;
                }
                const tocDirname = dirname(toc);
                const tmpTocPath = join(this.tempTocPath, tocDirname, 'for_translation_' + basename(toc));
                const {path: _path, ...restToc} = loadedToc
                await this.fs.writeFile(tmpTocPath, dump(restToc));
                this.tocYamlList.add(join(dirname(toc), 'for_translation_' + basename(toc)));
            }
        }
    }

    async getFiles() {
        const allFiles = new Set<string>();

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
                // this.logger.warn(error);
                allFiles.delete(entry);
            }
        }

        // TODO: Temp disable toc filter
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const allFilesArray = Array.from([...allFiles, ...this.tocYamlList]);

        return resolveFiles(
            this.config.input,
            this.config.files,
            this.config.include,
            this.config.exclude,
            this.config.source.language,
            ['.md', '.yaml'],
            allFilesArray,
        );
    }

    async cleanup() {
        if (isMainThread) {
            try {
                for (const toc of this.tocYamlList) {
                    const tmpTocPath = join(this.tempTocPath, toc);
                    await this.fs.rm(tmpTocPath, {force: true});
                }
            } catch (error) {
                this.logger.error('Failed to cleanup temporary files', error);
            }
        }
    }
}

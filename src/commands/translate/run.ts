import type {TranslateConfig} from './index';
import type {ExtractConfig} from './commands/extract';
import type {ConfigDefaults} from './utils/config';
import type {Config} from '~/core/config';
import type {Toc} from '~/core/toc';

import {dirname, extname, join, resolve} from 'node:path';
import {isMainThread} from 'node:worker_threads';

import {TocService} from '~/core/toc';
import {Run as BaseRun} from '~/core/run';
import {normalizePath} from '~/core/utils';
import {VarsService} from '~/core/vars';
import {MetaService} from '~/core/meta';
import {MarkdownService} from '~/core/markdown';

import {FileLoader, resolveFiles} from './utils';

type CommonRunConfig = Omit<TranslateConfig, 'provider'> & ExtractConfig & ConfigDefaults;

export class Run extends BaseRun<CommonRunConfig> {
    readonly vars: VarsService;
    readonly meta: MetaService;
    readonly toc: TocService;
    readonly markdown: MarkdownService;
    readonly tocYamlList: Set<NormalizedPath>;

    constructor(config: Config<CommonRunConfig>) {
        super(config);

        this.scopes.set('input', this.realpathSync(config.input));
        this.scopes.set('output', this.realpathSync(config.output));
        const sourcePath = join(config.input, config.source.language) as AbsolutePath;
        this.scopes.set('source', this.realpathSync(sourcePath));

        this.vars = new VarsService(this, {usePresets: false});
        this.meta = new MetaService(this);
        this.toc = new TocService(this, {skipMissingVars: true, mode: 'translate'});
        this.markdown = new MarkdownService(this, {skipMissingVars: true, mode: 'translate'});
        this.tocYamlList = new Set<NormalizedPath>();
    }

    async prepareRun() {
        await this.vars.init();
        await this.markdown.init();

        if (isMainThread) {
            const paths = await this.glob('**/toc.yaml', {
                cwd: this.input,
            });

            await this.toc.init(paths);

            for (const toc of paths) {
                this.tocYamlList.add(toc);
            }

            await this.toc.init(Array.from(this.tocYamlList) as NormalizedPath[]);
        }
    }

    async getFiles(): Promise<[string[], [string, string][]]> {
        const allFiles = new Set<NormalizedPath>();
        const copiedFromPaths = new Set<NormalizedPath>();
        const mergedDirectories = new Set<NormalizedPath>();

        for (const entry of this.toc.entries) {
            const metadata = this.meta.get(entry);
            if (metadata.sourcePath) {
                const sourcePath = metadata.sourcePath as NormalizedPath;
                copiedFromPaths.add(sourcePath);

                const sourcePathWithLang = normalizePath(
                    join(this.config.source.language, sourcePath),
                );
                copiedFromPaths.add(sourcePathWithLang);

                const sourceDir = normalizePath(dirname(sourcePath));
                mergedDirectories.add(sourceDir);
                const sourceDirWithLang = normalizePath(
                    join(this.config.source.language, sourceDir),
                );
                mergedDirectories.add(sourceDirWithLang);
            }
        }

        for (const entry of this.toc.entries) {
            if (!copiedFromPaths.has(entry)) {
                allFiles.add(entry);
            }
        }

        for (const entry of this.toc.entries) {
            if (copiedFromPaths.has(entry)) {
                continue;
            }

            try {
                const deps = await this.markdown.deps(entry);

                for (const dep of deps) {
                    if (dep.path.endsWith('.md') && !copiedFromPaths.has(dep.path)) {
                        allFiles.add(dep.path);
                    }
                }
            } catch (error) {
                this.logger.warn(error);
                allFiles.delete(entry);
            }
        }

        const filteredTocYamlList = Array.from(this.tocYamlList).filter((toc) => {
            if (copiedFromPaths.has(toc)) {
                return false;
            }

            const tocDir = normalizePath(dirname(toc));
            if (mergedDirectories.has(tocDir)) {
                return false;
            }

            return true;
        });

        const allFilesArray = Array.from([...allFiles, ...filteredTocYamlList]);

        const [resolvedFiles, skipped] = resolveFiles(
            this.config.input,
            this.config.files,
            this.config.include,
            this.config.exclude,
            this.config.source.language,
            ['.md', '.yaml'],
            this.config.filter ? allFilesArray : null,
        );

        const finalFiles: string[] = resolvedFiles.filter((file) => {
            const normalizedFile = normalizePath(file);

            if (copiedFromPaths.has(normalizedFile)) {
                return false;
            }

            for (const mergedDir of mergedDirectories) {
                if (normalizedFile.startsWith(mergedDir + '/') || normalizedFile === mergedDir) {
                    return false;
                }
            }

            return true;
        });

        return [finalFiles, skipped] as [string[], [string, string][]];
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

        const loader = new FileLoader(path, this.config.refResolve);

        return loader.load();
    }
}

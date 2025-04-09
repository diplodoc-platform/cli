import {Run as BaseRun} from '~/core/run';
import { Config } from '~/core/config';
import type {TranslateConfig} from './index';
import {VarsService} from '~/core/vars';
import {MetaService} from '~/core/meta';
import {TocService} from '~/core/toc';
import {MarkdownService, findLinks} from '~/core/markdown';
import {dirname, join} from 'node:path';

export class Run extends BaseRun<TranslateConfig> {
    readonly vars: VarsService;
    readonly meta: MetaService;
    readonly toc: TocService;
    readonly md: MarkdownService;

    constructor(config: Config<TranslateConfig>) {
        super(config);

        this.scopes.set('input', config.input);
        this.scopes.set('output', config.output);
        const sourcePath = join(config.input, config.source.language) as AbsolutePath;
        this.scopes.set('source', sourcePath);
        // this.config = { ...this.config, ...serviceDefaults} as Config<TranslateConfig>;
        // const translateRun = this as unknown as TranslateRun;
        
        this.vars = new VarsService(this);
        this.meta = new MetaService(this);
        this.toc = new TocService(this);
        this.md = new MarkdownService(this);
    }

    async init() {
        await this.vars.init();
        await this.md.init();

        await this.toc.load(this.config.source.language + '/toc.yaml' as RelativePath);
        
        // const allFiles = new Set<string>();
        
        // for (const entry of this.toc.entries) {
        //     allFiles.add(entry);
        // }
        
        // for (const entry of this.toc.entries) {
        //     const deps = await this.md.deps(entry as RelativePath);
        //     for (const dep of deps) {
        //         allFiles.add(dep.path);
        //     }
        // }
        

        // const test = Array.from(allFiles);
        const test =  await this.getFilesFromToc();
        return test;
    }

    private async getFilesFromToc(): Promise<Set<NormalizedPath>> {
        const files = new Set<NormalizedPath>();
        const entries = this.toc.entries;
    
        for (const entry of entries) {
            files.add(entry);
            
            const deps = await this.md.deps(entry as RelativePath);
            for (const dep of deps) {
                files.add(dep.path);
            }
            
            const linkDeps = await this.getMarkdownLinks(entry);
            for (const dep of linkDeps) {
                files.add(dep);
            }
        }
    
        return files;
    }

    private async getMarkdownLinks(filePath: NormalizedPath): Promise<Set<NormalizedPath>> {
        const deps = new Set<NormalizedPath>();
        
        try {
            const content = await this.md.load(filePath);
            
            const links = findLinks(content, false) as string[];
            
            for (const link of links) {
                if ((link.startsWith('./') || link.startsWith('../')) && link.endsWith('.md')) {
                    const absolutePath = join(dirname(filePath), link);
                    deps.add(absolutePath);
                }
            }
        } catch (error) {
            this.logger.error(`Error processing file ${filePath}: ${error}`);
        }
        
        return deps;
    }
}
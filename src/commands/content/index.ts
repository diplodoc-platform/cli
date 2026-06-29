import type {BaseProgram as BaseProgramType} from '~/core/program';
import type {ContentArgs, ContentConfig} from './types';

import {dirname, join} from 'node:path';
import {existsSync} from 'node:fs';
import {mkdir, writeFile} from 'node:fs/promises';

import {
    BaseProgram,
    getHooks as getBaseHooks,
    withConfigDefaults,
    withConfigScope,
} from '~/core/program';
import {Command} from '~/core/config';
import {YFM_CONFIG_FILENAME} from '~/constants';
import {getHooks as getMarkdownHooks} from '~/core/markdown';
import {Run} from '~/commands/build';
import {OutputFormat, buildConfigDefaults, normalize, validate} from '~/commands/build/config';
import {MarkdownCollector, SELF_CONTAINED} from '~/commands/build/features/output-md/collect';
import {addMetaFrontmatter} from '~/commands/build/features/output-md/utils';
import {getBaseMdItPlugins} from '~/commands/build/features/output-html/utils';

import {DESCRIPTION, NAME, options} from './config';
import {resolveContentConfig} from './config-resolve';
import {ContentWatcher} from './features/watch';

export type {ContentArgs, ContentConfig};

export const CONTENT_START = '<<<<<< YFM CONTENT START >>>>>>';
export const CONTENT_END = '<<<<<< YFM CONTENT END >>>>>>';

/**
 * Detects a `content --raw` invocation from raw process argv. Used by the
 * entrypoint to keep top-level banners (version line, build timer, completion
 * banner) off stdout, so raw mode emits the rendered content and nothing else.
 */
export function isRawContentRun(argv: string[]): boolean {
    return argv.includes(NAME) && (argv.includes('--raw') || argv.includes('--raw=true'));
}

@withConfigScope('build')
@withConfigDefaults(
    () =>
        ({
            ...buildConfigDefaults(),
            watch: false,
            raw: false,
            quiet: true,
        }) as Partial<ContentConfig>,
)
export class Content extends BaseProgram<ContentConfig, ContentArgs> {
    readonly name = 'Content';

    readonly command = new Command(NAME)
        .description(DESCRIPTION)
        .helpOption(true)
        .allowUnknownOption(false);

    readonly options = [
        options.input,
        options.output,
        options.outputFormat,
        options.watch,
        options.raw,
        options.varsPreset,
        options.vars,
        options.allowHtml,
        options.sanitizeHtml,
        options.multilineTermDefinitions,
        options.idGenerator,
        options.maxInlineSvgSize,
        options.maxOpenapiIncludeSize,
        options.maxOpenapiIncludeInlineSize,
        options.langs,
        options.strict,
        options.config(YFM_CONFIG_FILENAME),
    ];

    private run!: Run;

    apply(program?: BaseProgramType) {
        getBaseHooks(this).RawConfig.tap('Content', validate);
        getBaseHooks(this).Config.tap({name: 'Content', stage: -1}, normalize);
        getBaseHooks(this).Config.tap('Content', (config) => {
            resolveContentConfig(config);

            return config;
        });

        super.apply(program);
    }

    async action() {
        await this.prepareRun();
        await this.emit();

        if (this.config.watch) {
            await this.startWatch();
        }
    }

    private async prepareRun() {
        this.run = new Run(this.config);
        this.run.logger.pipe(this.logger);
        this.run.logger.setup({quiet: true});

        // Register md-it plugins used for the html transform (content fragment).
        getMarkdownHooks(this.run.markdown).Plugins.tap('Content', (plugins) =>
            plugins.concat(getBaseMdItPlugins()),
        );

        await this.run.vars.init();
        await this.run.markdown.init();
    }

    private async render(): Promise<string> {
        const {file, outputFormat} = this.config;

        if (outputFormat === OutputFormat.md) {
            const collector = new MarkdownCollector(this.run, SELF_CONTAINED);
            const content = await collector.collect(file);
            const meta = await this.run.meta.dump(file);

            return addMetaFrontmatter(content, meta, undefined);
        }

        const markdown = await this.run.markdown.load(file);
        const deps = await this.run.markdown.deps(file);
        const assets = await this.run.markdown.assets(file);
        const [result] = await this.run.transform(file, markdown, {deps, assets});

        return result;
    }

    private async emit() {
        const content = await this.render();

        if (this.config.outputFile) {
            await mkdir(dirname(this.config.outputFile), {recursive: true});
            await writeFile(this.config.outputFile, content, 'utf8');

            return;
        }

        if (this.config.raw) {
            process.stdout.write(content);

            return;
        }

        process.stdout.write(`${CONTENT_START}\n${content}\n${CONTENT_END}\n`);
    }

    private async startWatch() {
        const state: {busy: boolean; watcher?: ContentWatcher} = {busy: false};

        const rebuild = async () => {
            if (state.busy) {
                return;
            }

            state.busy = true;
            try {
                // Rebuild the Run from scratch to avoid stale markdown/vars caches.
                await this.prepareRun();
                await this.emit();
                state.watcher?.add(await this.watchPaths());
            } catch (error) {
                this.run.logger.error(error as Error);
            } finally {
                state.busy = false;
            }
        };

        state.watcher = new ContentWatcher(await this.watchPaths(), () => {
            rebuild().catch(() => {});
        });

        // Keep the process alive until terminated.
        await new Promise<never>(() => {});
    }

    private async watchPaths(): Promise<AbsolutePath[]> {
        const paths = new Set<AbsolutePath>();

        paths.add(join(this.run.input, this.config.file) as AbsolutePath);

        try {
            const deps = await this.run.markdown.deps(this.config.file);
            for (const dep of deps) {
                paths.add(join(this.run.input, dep.path) as AbsolutePath);
            }
        } catch {
            // Dependencies may be unresolvable on a broken file; watch what we can.
        }

        for (const preset of this.presetPaths()) {
            if (existsSync(preset)) {
                paths.add(preset);
            }
        }

        return [...paths];
    }

    private presetPaths(): AbsolutePath[] {
        const result: AbsolutePath[] = [];
        const segments = dirname(this.config.file).split('/').filter(Boolean);

        let dir = this.run.input as string;
        result.push(join(dir, 'presets.yaml') as AbsolutePath);

        for (const segment of segments) {
            dir = join(dir, segment);
            result.push(join(dir, 'presets.yaml') as AbsolutePath);
        }

        return result;
    }
}

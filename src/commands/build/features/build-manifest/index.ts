import type {Build, Run} from '~/commands/build';
import type {Redirects} from '../../services/redirects';

import {join, parse} from 'node:path';
import {load} from 'js-yaml';

import {type Command, valuable} from '~/core/config';
import {getHooks as getBaseHooks} from '~/core/program';
import {getHooks as getBuildHooks} from '~/commands/build';

import {options} from './config';

type FileDescriptor = {
    ext: string;
    toc: string;
};

type TrieNode = {
    file?: FileDescriptor;
    children?: FileTrie;
};

type FileTrie = {
    [key: string]: TrieNode | undefined;
};

type FileTrieEntryPoint = {
    trie: FileTrie;
    tocMapping: Record<string, string>;
};

type BuildManifestFormat = {
    fileTrie: FileTrieEntryPoint;
    yfmConfig: unknown;
    redirects: Redirects;
};

const MANIFEST_FILENAME = 'yfm-build-manifest.json';

export type BuildManifestArgs = {
    buildManifest: boolean;
};

export type BuildManifestConfig = {
    buildManifest: boolean;
};

export class BuildManifest {
    private lastTocId = 0;

    apply(program: Build) {
        getBaseHooks(program).Command.tap('BuildManifest', (command: Command) => {
            command.addOption(options.buildManifest);
        });

        getBaseHooks(program).Config.tapPromise('BuildManifest', async (config, args) => {
            let buildManifest = false;

            if (valuable(config.buildManifest)) {
                buildManifest = Boolean(config.buildManifest);
            }

            if (valuable(args.buildManifest)) {
                buildManifest = Boolean(args.buildManifest);
            }

            config.buildManifest = buildManifest;

            return config;
        });

        getBuildHooks(program)
            .AfterRun.for('md')
            .tapPromise('BuildManifest', async (run: Run) => {
                if (!run.config.buildManifest) {
                    return;
                }

                const redirects = run.redirects.rawRedirects;
                const fileTrie = this.buildFileTrie(run);
                const yfmConfig = await this.readYfmConfig(run);

                const manifest: BuildManifestFormat = {
                    redirects,
                    fileTrie,
                    yfmConfig,
                };

                await run.write(join(run.output, MANIFEST_FILENAME), JSON.stringify(manifest));
            });
    }

    private async readYfmConfig(run: Run): Promise<unknown> {
        try {
            const yfmConfigPath = run.configPath;

            return load(await run.read(yfmConfigPath)) ?? {};
        } catch (error) {
            run.logger.warn(`BuildManifest: Failed to read YFM config: ${error}`);

            return {};
        }
    }

    private buildFileTrie(run: Run): FileTrieEntryPoint {
        const fileTrie: FileTrie = {};
        const reverseTocMapping: Record<string, string> = Object.fromEntries(
            run.toc.tocs
                .map(({path}) => path)
                .sort()
                .map((path) => [path, this.nextId()]),
        );

        const getOrAddTocToMapping = (tocPath: NormalizedPath) => {
            const mapping = reverseTocMapping[tocPath] ?? this.nextId();

            reverseTocMapping[tocPath] = mapping;

            return mapping;
        };

        const addFile = (path: NormalizedPath) => {
            const pathParts = path.split('/');

            if (pathParts.length === 0) {
                run.logger.warn(
                    `BuildManifest: Attempted to add an empty path to the prefix tree.`,
                );

                return;
            }

            const fileWithExtension = pathParts[pathParts.length - 1];
            const dirs = pathParts.slice(0, -1);

            const {name, ext} = parse(fileWithExtension);

            let lastHead: FileTrie = fileTrie;

            dirs.forEach((dir) => {
                const maybeExisting = lastHead[dir];
                const trieNode = maybeExisting ?? {};
                const newChildren = trieNode.children ?? {};
                lastHead[dir] = trieNode;

                trieNode.children = newChildren;

                lastHead = newChildren;
            }, fileTrie);

            if (lastHead[name]?.file) {
                const pathToReport = path.replace(/\..+$/, '');

                run.logger.error(
                    `BuildManifest: Attepmted to commit a file with extension \`${ext}\` at path \`${pathToReport}\` which already exists with extension \`${lastHead[name]?.file?.ext}\`. This behavior is not supported.`,
                );

                throw new Error(
                    `File object at path ${pathToReport} already exists in prefix tree.`,
                );
            }

            const trieNode = lastHead[name] ?? {};
            const file = {ext: ext, toc: getOrAddTocToMapping(run.toc.for(path).path)};

            trieNode.file = file;
            lastHead[name] = trieNode;
        };

        run.toc.entries.forEach(addFile);

        return {
            trie: fileTrie,
            tocMapping: Object.fromEntries(
                Object.entries(reverseTocMapping).map(([k, v]) => [v, k]),
            ),
        };
    }

    private nextId() {
        return `t${this.lastTocId++}`;
    }
}

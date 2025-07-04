import type {Build, Run} from '~/commands/build';
import type {Redirects} from '../../services/redirects';
import {type Command, valuable} from '~/core/config';

import {join, parse} from 'node:path';
import {load} from 'js-yaml';

import {getHooks as getBaseHooks} from '~/core/program';
import {getHooks as getBuildHooks} from '~/commands/build';

import {options} from './config';

type FileDescriptor = {
    e: string;
    t: string;
};

type TrieNode = {
    f?: FileDescriptor;
    c?: FileTrie;
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
    private lastTocId = '';

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
            run.logger.warn(`BuildMap: Failed to read YFM config: ${error}`);

            return {};
        }
    }

    private buildFileTrie(run: Run): FileTrieEntryPoint {
        const fileTrie: FileTrie = {};
        const reverseTocMapping: Record<string, string> = {};

        const getOrAddTocToMapping = (tocPath: NormalizedPath) => {
            const mapping = reverseTocMapping[tocPath] ?? this.nextId();

            reverseTocMapping[tocPath] = mapping;

            return mapping;
        };

        const addFile = (path: NormalizedPath) => {
            const pathParts = path.split('/');

            if (pathParts.length === 0) {
                run.logger.warn(`BuildMap: Attempted to add an empty path to the prefix tree.`);

                return;
            }

            const fileWithExtension = pathParts[pathParts.length - 1];
            const dirs = pathParts.slice(0, -1);

            const {name, ext} = parse(fileWithExtension);

            const lastHead = dirs.reduce<FileTrie>((head, dir) => {
                const maybeExisting = head[dir];
                const trieNode = maybeExisting ?? {};
                const newChildren = trieNode.c ?? {};
                head[dir] = trieNode;

                trieNode.c = newChildren;

                return newChildren;
            }, fileTrie);

            if (lastHead[name]?.f) {
                run.logger.warn(`BuildMap: File ${path} already exists in prefix tree.`);
                run.logger.warn(
                    '   This likely means two files with the same name have different extensions.',
                );
                run.logger.warn(
                    '   Please note that this might lead to undefined behavior. Overriding.',
                );
            }

            const trieNode = lastHead[name] ?? {};
            const file = {e: ext, t: getOrAddTocToMapping(run.toc.for(path).path)};

            trieNode.f = file;
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
        const previous = this.lastTocId;

        if (previous === '') {
            return this.updateId('a');
        }

        const lastChar = previous.charAt(previous.length - 1);

        if (lastChar === 'z') {
            return this.updateId(`${previous.slice(0, -1)}a`);
        }

        const nextChar = String.fromCharCode(lastChar.charCodeAt(0) + 1);

        return this.updateId(`${previous.slice(0, -1)}${nextChar}`);
    }

    private updateId(id: string) {
        this.lastTocId = id;

        return id;
    }
}

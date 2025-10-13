import type {Run as BaseRun} from '~/core/run';
import type {Preset, Presets} from './types';
import type {Scope} from './utils';

import {dirname, join} from 'node:path';
import {isEmpty} from 'lodash';
import {dump, load} from 'js-yaml';

import {Graph, all, bounded, normalizePath, own} from '~/core/utils';

import {getHooks, withHooks} from './hooks';
import {proxy} from './utils';

export type VarsServiceConfig = {
    varsPreset: string;
    vars: Hash;
};

type Run = BaseRun<VarsServiceConfig>;

@withHooks
export class VarsService {
    readonly name = 'Vars';

    readonly relations = new Graph<{type: string}>();

    private run: Run;

    private logger: Run['logger'];

    private config: VarsServiceConfig;

    private presets: Hash<Preset> = {};

    private usePresets = true;

    private storeDeps = true;

    constructor(run: Run, {usePresets = true} = {}) {
        this.run = run;
        this.logger = run.logger;
        this.config = run.config;
        this.usePresets = usePresets;
    }

    async init(presets?: NormalizedPath[]) {
        if (!this.usePresets) {
            return [];
        }

        presets =
            presets ||
            (await this.run.glob('**/presets.yaml', {
                cwd: this.run.input,
            }));

        return all(presets.map(this.load));
    }

    /**
     * @returns preset value by filename
     */
    get(path: NormalizedPath): Preset | undefined {
        if (!this.relations.hasNode(path)) {
            return undefined;
        }

        return this.presets[path] as Preset | undefined;
    }

    for(path: RelativePath, from?: NormalizedPath): Preset {
        const scopes = this.scopes(from || path);
        const keys = () => {
            const keys = [];

            for (const {scope} of scopes) {
                keys.push(...Object.keys(scope));
            }

            return keys;
        };

        return proxy<Presets>(path, (prop: string) => {
            for (let i = 0; i < scopes.length; i++) {
                const {scope, path} = scopes[i];

                if (own(scope, prop)) {
                    return {
                        value: scope[prop],
                        scope: path,
                        track: this.trackDependency,
                        missed: this.trackMissedDependency,
                        keys,
                    };
                }
            }

            return {
                track: this.trackDependency,
                missed: this.trackMissedDependency,
                keys,
            };
        });
    }

    /**
     * Получает файлы, которые зависят от изменённых свойств и (опционально) конкретного scopePath
     */
    getAffectedFiles(scopePath: string, changedProperties: string[]) {
        const affectedFiles = new Set<NormalizedPath>();

        for (const property of changedProperties) {
            const dependencyKey = `${scopePath}#${property}`;

            if (this.relations.hasNode(dependencyKey)) {
                const dependents = this.relations.dependentsOf(dependencyKey);
                for (const dependent of dependents) {
                    affectedFiles.add(dependent as NormalizedPath);
                }
            }
        }

        return affectedFiles;
    }

    getSpecifiedFiles(pathA: NormalizedPath, addedProps: string[], removedProps: string[]) {
        const {varsPreset} = this.config;
        const props: string[] = [];
        const specified: Set<NormalizedPath> = new Set();
        const nodes = this.relations.overallOrder().filter((node) => node.indexOf('#') > -1);

        for (const scopedPropA of addedProps) {
            const [scopeA, propA] = splitProp(scopedPropA);
            props.push(
                ...nodes.filter((node) => {
                    const [pathB, scopedPropB] = node.split('#');
                    const [scopeB, propB] = splitProp(scopedPropB);
                    return propA === propB && isMoreSpecific(pathA, pathB, scopeA, scopeB);
                }),
            );
        }

        for (const scopedPropA of removedProps) {
            const [scopeA, propA] = splitProp(scopedPropA);
            props.push(
                ...nodes.filter((pathProp) => {
                    const [pathB, scopedPropB] = pathProp.split('#');
                    const [scopeB, propB] = splitProp(scopedPropB);
                    return propA === propB && !isMoreSpecific(pathA, pathB, scopeA, scopeB);
                }),
            );
        }

        for (const prop of props) {
            (this.relations.dependantsOf(prop) as NormalizedPath[])
                .filter((path) => path !== pathA)
                .filter((path) => canBeUsedByPath(pathA, path))
                .forEach((path) => specified.add(path));
        }

        return specified;

        function splitProp(scopedProp: string) {
            const dot = scopedProp.indexOf('.');

            if (dot > -1) {
                return [scopedProp.slice(0, dot), scopedProp.slice(dot)];
            }

            return [scopedProp, ''];
        }

        function canBeUsedByPath(preset: NormalizedPath, path: NormalizedPath) {
            const presetParts = dirname(preset).split('/');
            const pathParts = dirname(path).split('/');

            while (presetParts.length) {
                if (presetParts[0] !== pathParts[0]) {
                    break;
                }

                presetParts.shift();
                pathParts.shift();
            }

            return !presetParts.length;
        }

        function isMoreSpecific(
            pathA: NormalizedPath,
            pathB: string,
            scopeA: string,
            scopeB: string,
        ) {
            if (pathB === 'config') {
                return false;
            }

            if (pathB === 'missed') {
                return true;
            }

            if (pathA.length === pathB.length) {
                return scopeA !== scopeB && scopeA === varsPreset;
            }

            return pathA.length > pathB.length;
        }
    }

    dump(presets: Hash): string {
        return dump(presets, {
            lineWidth: 120,
        });
    }

    @bounded
    private async load(path: RelativePath): Promise<Hash> {
        const file = normalizePath(path);

        this.logger.proc(file);

        this.relations.addNode(file);

        const source = normalizePath(join(this.run.input, file)) as AbsolutePath;
        const data = await getHooks(this).PresetsLoaded.promise(
            load((await this.run.read(source)) || '{}') as Presets,
            file,
        );

        this.relations.setNodeData(file, {type: 'preset'});
        this.presets[file] = data;

        return data;
    }

    private scopes(path: RelativePath) {
        const paths = this.paths(path);
        const config = {scope: this.config.vars, path: 'config'} as Scope;

        return [config].concat(
            paths.map((path) => {
                const [preset, scope] = path.split('#') as [NormalizedPath, string];

                return {
                    scope: (this.get(preset) as Presets)[scope],
                    path,
                };
            }),
        );
    }

    private paths(path: RelativePath) {
        const varsPreset = this.config.varsPreset || 'default';
        const paths = [];
        const dirs = [normalizePath(path)];

        while (dirs.length) {
            const dir = dirs.pop() as NormalizedPath;
            const path = normalizePath(join(dir, 'presets.yaml'));
            const preset = this.get(path);

            if (preset) {
                const defaults = preset['default'];
                const overrides = preset[varsPreset];

                if (overrides && !isEmpty(overrides)) {
                    paths.push(`${path}#${varsPreset}`);
                }

                if (varsPreset !== 'default' && defaults && !isEmpty(defaults)) {
                    paths.push(`${path}#default`);
                }
            }

            const next = normalizePath(dirname(dir));
            if (dir !== next) {
                dirs.push(next);
            }
        }

        return paths;
    }

    /**
     * Отслеживает зависимость файла от свойства
     */
    @bounded
    private trackDependency(
        path: RelativePath,
        scopePath: string,
        propertyPath: string | symbol,
    ): void {
        if (!this.storeDeps) {
            return;
        }

        if (typeof propertyPath !== 'string') {
            return;
        }

        let dependencyKey: string;

        const file = normalizePath(path);

        this.relations.addNode(file);

        if (['config', 'missed'].includes(scopePath)) {
            dependencyKey = `${scopePath}#${propertyPath}`;
        } else {
            const [preset, scope] = scopePath.split('#');
            dependencyKey = `${preset}#${scope}.${propertyPath}`;

            this.relations.addNode(preset);
            this.relations.addDependency(preset, file);
        }

        if (!this.relations.hasNode(dependencyKey)) {
            this.relations.addNode(dependencyKey);
        }

        this.relations.addDependency(file, dependencyKey);
    }

    @bounded
    private trackMissedDependency(path: RelativePath, propertyPath: string | symbol): void {
        if (!this.storeDeps) {
            return;
        }

        if (typeof propertyPath !== 'string') {
            return;
        }

        const dependencyKeys = [
            `missed#default.${propertyPath}`,
            `missed#${this.config.varsPreset}.${propertyPath}`,
        ];

        const file = normalizePath(path);

        this.relations.addNode(file);

        for (const key of dependencyKeys) {
            if (!this.relations.hasNode(key)) {
                this.relations.addNode(key);
            }

            this.relations.addDependency(file, key);
        }
    }
}

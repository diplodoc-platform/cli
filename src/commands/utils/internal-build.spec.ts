import {describe, expect, it} from 'vitest';

import {applyInternalBuildDefaults} from './internal-build';

describe('internal build defaults', () => {
    it.each([
        [{}, true, true],
        [{vcs: false}, false, true],
        [{mtimes: false}, true, false],
        [{vcs: false, mtimes: false}, false, false],
        [{vcs: {enabled: false}}, {enabled: false}, true],
        [{mtimes: {enabled: false}}, true, {enabled: false}],
        [{vcs: {scopes: ['shared/docs']}}, {scopes: ['shared/docs']}, true],
    ])('preserves explicit settings in %j', (source, vcs, mtimes) => {
        const config: Hash = structuredClone(source);

        applyInternalBuildDefaults(config, {internalBuild: true});

        expect(config.vcs).toEqual(vcs);
        expect(config.mtimes).toEqual(mtimes);
    });

    it.each(['is-external', 'is-new-external'])('keeps %s config unchanged', (flag) => {
        const config = {'docs-viewer': {[flag]: true}};

        applyInternalBuildDefaults(config, {internalBuild: true});

        expect(config).toEqual({'docs-viewer': {[flag]: true}});
    });

    it.each(['is-external', 'is-new-external'])(
        'preserves root %s when build has its own viewer settings',
        (flag) => {
            for (const viewer of [{}, {[flag]: false}, {unrelated: true}]) {
                const config = {
                    'docs-viewer': {[flag]: true},
                    extensions: ['root'],
                    build: {'docs-viewer': viewer, extensions: ['build']},
                };
                const source = structuredClone(config);

                applyInternalBuildDefaults(config, {internalBuild: true});

                expect(config).toEqual(source);
            }
        },
    );

    it.each(['is-external', 'is-new-external'])(
        'preserves build %s when root has its own viewer settings',
        (flag) => {
            const config = {
                'docs-viewer': {[flag]: false},
                build: {'docs-viewer': {[flag]: true}},
            };
            const source = structuredClone(config);

            applyInternalBuildDefaults(config, {internalBuild: true});

            expect(config).toEqual(source);
        },
    );

    it('does not change ordinary builds', () => {
        const config = {};

        applyInternalBuildDefaults(config, {});

        expect(config).toEqual({});
    });

    it.each(['arcadia-vcs', '@diplodoc/cli/arcadia-vcs', {name: 'arcadia-vcs', custom: true}])(
        'preserves connector %j without duplication',
        (extension) => {
            const config = {extensions: ['first', extension]};

            applyInternalBuildDefaults(config, {internalBuild: true});
            applyInternalBuildDefaults(config, {internalBuild: true});

            expect(config.extensions).toEqual(['first', extension]);
        },
    );

    it('does not add a second connector supplied through CLI args', () => {
        const config: Hash = {};

        applyInternalBuildDefaults(config, {
            internalBuild: true,
            extensions: ['arcadia-vcs'],
        });

        expect(config.extensions).toEqual([]);
    });

    it('honors --no-vcs before choosing the connector', () => {
        const config: Hash = {};

        applyInternalBuildDefaults(config, {internalBuild: true, vcs: false});

        expect(config.extensions).toBeUndefined();
    });

    it.each([false, {enabled: false}])('preserves scoped VCS opt-out %j', (vcs) => {
        const config = {extensions: ['root'], build: {vcs, extensions: ['build']}};

        applyInternalBuildDefaults(config, {internalBuild: true});

        expect(config.extensions).toEqual(['root']);
        expect(config.build.extensions).toEqual(['build']);
        expect(config.build.vcs).toEqual(vcs);
    });

    it('prepares scoped build settings before initial extension discovery', () => {
        const config: Hash = {build: {vcs: {scopes: ['shared/docs']}}};

        applyInternalBuildDefaults(config, {internalBuild: true});

        expect(config.build.vcs).toEqual({scopes: ['shared/docs']});
        expect(config.build.mtimes).toBe(true);
        expect(config.extensions).toEqual(['arcadia-vcs']);
        expect(config.build.extensions).toEqual(['arcadia-vcs']);
    });

    it.each([
        [['root'], [], ['root', 'arcadia-vcs']],
        [[], ['build'], ['build', 'arcadia-vcs']],
        [['root'], ['build'], ['root', 'build', 'arcadia-vcs']],
        [['root', 'arcadia-vcs'], ['build'], ['root', 'arcadia-vcs', 'build']],
        [[], ['@diplodoc/cli/arcadia-vcs'], ['@diplodoc/cli/arcadia-vcs']],
    ])(
        'preserves root %j and scoped %j extensions across repeated preparation',
        (root, build, expected) => {
            const config = {extensions: root, build: {extensions: build}};

            applyInternalBuildDefaults(config, {internalBuild: true});
            applyInternalBuildDefaults(config, {internalBuild: true});

            expect(config.extensions).toEqual(expected);
            expect(config.build.extensions).toEqual(expected);
        },
    );

    it('uses scoped options without registering shared extensions twice', () => {
        const extension = {name: 'shared', option: 'build'};
        const config = {
            extensions: ['root', {name: 'shared', option: 'root'}],
            build: {extensions: [extension, 'build']},
        };

        applyInternalBuildDefaults(config, {internalBuild: true});
        applyInternalBuildDefaults(config, {internalBuild: true});

        const expected = ['root', extension, 'build', 'arcadia-vcs'];
        expect(config.extensions).toEqual(expected);
        expect(config.build.extensions).toEqual(expected);
    });

    it('recognizes connector aliases shared between root and build', () => {
        const extension = {name: '@diplodoc/cli/arcadia-vcs', custom: true};
        const config = {
            extensions: ['arcadia-vcs'],
            build: {extensions: [extension]},
        };

        applyInternalBuildDefaults(config, {internalBuild: true});
        applyInternalBuildDefaults(config, {internalBuild: true});

        expect(config.extensions).toEqual([extension]);
        expect(config.build.extensions).toEqual([extension]);
    });
});

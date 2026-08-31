import type {Run} from '~/commands/build';
import type {ResolvedSource} from './sources';

import {join, resolve} from 'node:path';
import {describe, expect, it} from 'vitest';

import {permalink, resolveSources} from './sources';

const run = (sources: Hash<unknown>, vars: Hash = {}) =>
    ({
        originalInput: '/project/docs',
        config: {codeSources: sources, vars, sourcesDownloadDir: '/downloads'},
    }) as unknown as Run;

describe('resolveSources', () => {
    describe('git', () => {
        it('should default to github', () => {
            const sources = resolveSources(run({sdk: {type: 'git', repo: 'org/repo'}}));

            expect(sources.sdk).toMatchObject({
                type: 'git',
                host: 'https://github.com',
                repo: 'org/repo',
                url: 'https://github.com/org/repo',
                vendored: false,
            });
        });

        it('should download from the github raw host', () => {
            const sources = resolveSources(run({sdk: {type: 'git', repo: 'org/repo'}}));

            expect(sources.sdk.raw).toBe(
                'https://raw.githubusercontent.com/{repo}/{commit}/{path}',
            );
        });

        it('should use the gitlab url shape for a gitlab host', () => {
            const sources = resolveSources(
                run({sdk: {type: 'git', repo: 'org/repo', host: 'https://gitlab.com'}}),
            );

            expect(sources.sdk.raw).toBe('{host}/{repo}/-/raw/{commit}/{path}');
        });

        it('should assume the github shape for an unknown host', () => {
            const sources = resolveSources(
                run({sdk: {type: 'git', repo: 'org/repo', host: 'https://git.internal'}}),
            );

            expect(sources.sdk.raw).toBe('{host}/{repo}/raw/{commit}/{path}');
        });

        it('should accept a custom raw template', () => {
            const sources = resolveSources(
                run({
                    sdk: {
                        type: 'git',
                        repo: 'org/repo',
                        raw: '{host}/{repo}/plain/{commit}/{path}',
                    },
                }),
            );

            expect(sources.sdk.raw).toBe('{host}/{repo}/plain/{commit}/{path}');
        });

        it('should trim a trailing slash off the host', () => {
            const sources = resolveSources(
                run({sdk: {type: 'git', repo: 'org/repo', host: 'https://git.internal/'}}),
            );

            expect(sources.sdk.url).toBe('https://git.internal/org/repo');
        });

        it('should place the source in the download directory', () => {
            const sources = resolveSources(run({sdk: {type: 'git', repo: 'org/repo'}}));

            // `join`, not `resolve`: the harness passes the download dir raw,
            // the way the config hook would have already resolved it.
            expect(sources.sdk.root.startsWith(join('/downloads', 'sdk-'))).toBe(true);
            expect(sources.sdk.root).toMatch(/sdk-[0-9a-f]{12}$/);
        });

        it('should key the directory by ref, so two versions do not collide', () => {
            const one = resolveSources(run({sdk: {type: 'git', repo: 'org/repo', ref: 'v1'}}));
            const two = resolveSources(run({sdk: {type: 'git', repo: 'org/repo', ref: 'v2'}}));

            expect(one.sdk.root).not.toBe(two.sdk.root);
        });

        it('should derive the same path for the same input', () => {
            const one = resolveSources(run({sdk: {type: 'git', repo: 'org/repo', ref: 'v1'}}));
            const two = resolveSources(run({sdk: {type: 'git', repo: 'org/repo', ref: 'v1'}}));

            expect(one.sdk.root).toBe(two.sdk.root);
        });

        it('should default the ref', () => {
            expect(resolveSources(run({sdk: {type: 'git', repo: 'org/repo'}})).sdk.ref).toBe(
                'main',
            );
        });
    });

    describe('local', () => {
        it('should resolve dir relative to the project input', () => {
            const sources = resolveSources(run({sdk: {type: 'local', dir: '../sdk'}}));

            expect(sources.sdk).toMatchObject({type: 'local', root: resolve('/project/sdk')});
        });

        it('should keep an absolute dir as is', () => {
            expect(
                resolveSources(run({sdk: {type: 'local', dir: '/elsewhere/sdk'}})).sdk.root,
            ).toBe(resolve('/elsewhere/sdk'));
        });

        it('should apply path as the root inside the source', () => {
            const sources = resolveSources(
                run({sdk: {type: 'local', dir: '../sdk', path: 'examples'}}),
            );

            expect(sources.sdk).toMatchObject({
                root: resolve('/project/sdk/examples'),
                prefix: 'examples',
            });
        });

        it('should keep a slashed path inside dir instead of making it absolute', () => {
            const sources = resolveSources(
                run({sdk: {type: 'local', dir: '../sdk', path: '/examples/'}}),
            );

            expect(sources.sdk).toMatchObject({
                root: resolve('/project/sdk/examples'),
                prefix: 'examples',
            });
        });

        it('should never be downloaded', () => {
            expect(resolveSources(run({sdk: {type: 'local', dir: '../sdk'}})).sdk.raw).toBe(null);
        });

        it('should link only through an explicit template', () => {
            const sources = resolveSources(
                run({sdk: {type: 'local', dir: '../sdk', link: 'https://example.com/{path}'}}),
            );

            expect(permalink(sources.sdk, 'a.go', 1, 2)).toBe('https://example.com/a.go');
        });

        it('should emit no link without a template', () => {
            expect(
                permalink(
                    resolveSources(run({sdk: {type: 'local', dir: '../sdk'}})).sdk,
                    'a.go',
                    1,
                    2,
                ),
            ).toBe(null);
        });
    });

    describe('http', () => {
        it('should keep the url as the base', () => {
            const sources = resolveSources(
                run({files: {type: 'http', url: 'https://storage/bucket/'}}),
            );

            expect(sources.files).toMatchObject({
                url: 'https://storage/bucket',
                ref: null,
                raw: null,
            });
        });
    });

    describe('vars', () => {
        it('should interpolate global vars into ref', () => {
            const sources = resolveSources(
                run({sdk: {type: 'git', repo: 'org/repo', ref: '{{ v }}'}}, {v: 'v3.24.2'}),
            );

            expect(sources.sdk.ref).toBe('v3.24.2');
        });

        it('should interpolate vars into repo and dir', () => {
            const repo = resolveSources(run({a: {type: 'git', repo: 'org/{{ v }}'}}, {v: 'sdk'}));
            const dir = resolveSources(run({b: {type: 'local', dir: '../{{ v }}'}}, {v: 'sdk'}));

            expect(repo.a.repo).toBe('org/sdk');
            expect(dir.b.root).toBe(resolve('/project/sdk'));
        });

        it('should fail on an undefined var instead of emitting a broken ref', () => {
            expect(() =>
                resolveSources(run({sdk: {type: 'git', repo: 'org/repo', ref: '{{ missing }}'}})),
            ).toThrow(/undefined var 'missing'/);
        });
    });
});

describe('config validation', () => {
    it('should reject a non-map code-sources section', () => {
        expect(() => resolveSources(run('nope' as unknown as Hash<unknown>))).toThrow(
            /must be a map/,
        );
    });

    it('should reject a non-map source', () => {
        expect(() => resolveSources(run({sdk: 'org/repo'}))).toThrow(/'sdk' must be a map/);
    });

    it('should reject a misspelled field instead of failing later', () => {
        expect(() =>
            resolveSources(run({sdk: {type: 'git', repo: 'org/repo', reff: 'main'}})),
        ).toThrow(/Field 'reff' is not supported/);
    });

    it('should reject a field that does not apply to the type', () => {
        // A `git` source is addressed by repo, not by url.
        expect(() =>
            resolveSources(run({sdk: {type: 'git', repo: 'org/repo', url: 'https://host'}})),
        ).toThrow(/'url' is not supported by 'git'/);
    });

    it('should reject an unknown type', () => {
        expect(() => resolveSources(run({sdk: {type: 'svn', repo: 'o/r'}}))).toThrow(
            /Unknown type/,
        );
    });

    it('should reject a repo that is not owner/name', () => {
        expect(() =>
            resolveSources(run({sdk: {type: 'git', repo: 'https://github.com/org/repo'}})),
        ).toThrow(/expected 'owner\/name'/);
    });

    it('should reject a git source without a repo', () => {
        expect(() => resolveSources(run({sdk: {type: 'git', ref: 'main'}}))).toThrow(
            /needs a 'repo'/,
        );
    });

    it('should reject an http source without a url', () => {
        expect(() => resolveSources(run({f: {type: 'http'}}))).toThrow(/needs a 'url'/);
    });

    it('should reject a local source without a dir', () => {
        expect(() => resolveSources(run({f: {type: 'local'}}))).toThrow(/needs a 'dir'/);
    });

    it('should reject a non-string field value', () => {
        expect(() => resolveSources(run({sdk: {type: 'git', repo: 'o/r', ref: 42}}))).toThrow(
            /must be a string/,
        );
    });

    it('should reject a source name that cannot appear in a directive', () => {
        expect(() => resolveSources(run({'my sdk': {dir: '.'}}))).toThrow(/Invalid source name/);
    });

    it('should require a type rather than guess it from the fields', () => {
        expect(() => resolveSources(run({sdk: {repo: 'org/repo'}}))).toThrow(/needs a 'type'/);
    });
});

describe('permalink', () => {
    const source: ResolvedSource = {
        name: 'sdk',
        type: 'git',
        root: '/cache/sdk-abc' as AbsolutePath,
        base: '/cache/sdk-abc' as AbsolutePath,
        prefix: 'examples',
        host: 'https://github.com',
        repo: 'org/repo',
        url: 'https://github.com/org/repo',
        ref: 'v1.2.3',
        commit: null,
        raw: null,
        link: '{host}/{repo}/blob/{commit}/{path}#{lines}',
        vendored: false,
    };

    it('should include the source path prefix, not just the directive path', () => {
        expect(permalink(source, 'connect.go', 7, 11)).toBe(
            'https://github.com/org/repo/blob/v1.2.3/examples/connect.go#L7-L11',
        );
    });

    it('should emit a single line anchor', () => {
        expect(permalink(source, 'connect.go', 7, 7)).toContain('#L7');
    });

    it('should work without a prefix', () => {
        expect(permalink({...source, prefix: ''}, 'connect.go', 1, 2)).toBe(
            'https://github.com/org/repo/blob/v1.2.3/connect.go#L1-L2',
        );
    });

    it('should pin to the resolved commit rather than the ref', () => {
        const fetched = {...source, ref: 'main', commit: 'abc123'};

        expect(permalink(fetched, 'connect.go', 7, 11)).toBe(
            'https://github.com/org/repo/blob/abc123/examples/connect.go#L7-L11',
        );
    });

    it('should return null when there is nothing to link to', () => {
        expect(permalink({...source, url: null, link: null}, 'connect.go', 1, 2)).toBe(null);
    });
});

import {join} from 'node:path';
import {describe, expect, it} from 'vitest';
import {when} from 'vitest-when';
import {dedent} from 'ts-dedent';

import {setupRun} from '~/commands/build/__tests__';

import {MetaService} from './MetaService';
import {uniq} from 'lodash';

const content = {
    'test.md': dedent`
        ---
        metadata:
        - name: generator
          content: Diplodoc Platform vDIPLODOC-VERSION
        ---
        test text
    `,
};

function prepare() {
    const run = setupRun({
        addSystemMeta: false,
    });

    const service = new MetaService(run);

    for (const [file, data] of Object.entries(content)) {
        when(run.read).calledWith(join(run.input, file)).thenResolve(data);
    }

    return service;
}

async function call(path: RelativePath) {
    const service = prepare();

    expect(service.dump(path)).toMatchSnapshot();
}

function test(name: string, path: string) {
    it(name, async () => call(path as RelativePath));
}

describe('meta', () => {
    describe('service', () => {
        describe('load', () => {
            test('should load test file', 'test.md');

            it('should handle `has` trap', async () => {
                const service = prepare();

                service.addMetadata('test.md' as RelativePath, {
                    generator: `Diplodoc Platform vDIPLODOC-VERSION`,
                });
                service.addMetadata('test.md' as RelativePath, {
                    generator: `Diplodoc Platform vDIPLODOC-VERSION`,
                });

                const meta = service.get('test.md' as RelativePath);

                expect(
                    uniq(meta.metadata?.map((metaItem: Hash<unknown>) => metaItem.name)).length,
                ).toEqual(meta.metadata?.length);
            });
        });
    });
});

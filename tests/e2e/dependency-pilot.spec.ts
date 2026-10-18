import {expect, test} from 'vitest';

import {Runner} from '../fixtures/runner';

test('dependency pilot: the tested executable resolves the exact transform and YAML candidate', async () => {
    const report = await new Runner().runRaw(['--dependency-pilot-proof']);

    expect(report.code, report.stderr).toBe(0);
    const proof = JSON.parse(report.stdout);
    expect(proof).toMatchObject({
        transformSourceSha: 'cfd828dc7a491cc7e0e847a41ce9c615b27cc95b',
        transformVersion: '4.78.9',
        yamlVersion: '4.3.2',
        yamlSmokePassed: true,
    });
    expect(proof.transformRuntimeSha256).toBe(
        '30394f3bcf61a35042c80ce8a66170fcc6ecffe4a94d8773475cb4b429b9d02e',
    );
    // This also records proof from the packaged executable in the internal test log.
    // eslint-disable-next-line no-console
    console.info('DEPENDENCY_PILOT_PROOF', JSON.stringify(proof));
});

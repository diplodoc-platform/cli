import {expect, test} from 'vitest';

import {Runner} from '../fixtures/runner';

test('dependency pilot: the tested executable loads the selected components sanitizer through client SSR', async () => {
    const report = await new Runner().runRaw(['--dependency-pilot-proof']);

    expect(report.code, report.stderr).toBe(0);
    const proof = JSON.parse(report.stdout);
    expect(proof).toEqual({
        componentsSourceSha: '471b0452324f0e3963f465e3fa9a2f526cd679a5',
        componentsVersion: '5.24.1',
        domPurifyVersion: '3.4.17',
        domPurifyRuntimeLoaded: true,
        clientSourceSha: 'db7d41b1ab8db599c1e57ab21c17b7bdbad508a7',
        clientVersion: '5.14.8',
    });
    // Internal integration uses DIPLODOC_BINARY_PATH, so this comes from the binary.
    // eslint-disable-next-line no-console
    console.info('DEPENDENCY_PILOT_PROOF', JSON.stringify(proof));
});

'use strict';

// Archive module: lib/dependency-pilot-proof.js. Its requires resolve from transform.
const assert = require('node:assert/strict');
const yamlManifest = require('js-yaml/package.json');
const yaml = require('js-yaml');

const manifest = require('../package.json');

exports.readPilotProof = function readPilotProof() {
    assert.equal(manifest.version, '4.78.9');
    assert.equal(manifest.dependencyPilot.sourceSha, 'cfd828dc7a491cc7e0e847a41ce9c615b27cc95b');
    assert.equal(yamlManifest.version, '4.3.2');
    assert.deepEqual(yaml.load('candidate:\n  yaml: 4.3.2\n'), {candidate: {yaml: '4.3.2'}});
    return {
        transformSourceSha: manifest.dependencyPilot.sourceSha,
        transformVersion: manifest.version,
        transformRuntimeSha256: manifest.dependencyPilot.runtimeSha256,
        yamlVersion: yamlManifest.version,
        yamlSmokePassed: true,
    };
};

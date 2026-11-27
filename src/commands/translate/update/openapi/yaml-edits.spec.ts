import {describe, expect, it} from 'vitest';
import {isMap, isScalar, isSeq, parseDocument} from 'yaml';

import {YamlEdits, property, readTarget, scanLines, yamlAt} from './yaml-edits';

describe('OpenAPI YAML range edits', () => {
    it('records the exact content, offset and terminator of each line', () => {
        const long = ' '.repeat(20000);
        expect(scanLines('header\r\n' + long + '\nlast')).toEqual([
            {text: 'header', eol: '\r\n', offset: 0},
            {text: long, eol: '\n', offset: 8},
            {text: 'last', eol: '', offset: 20009},
        ]);
    });

    it('keeps comments when appending to a block map without a terminal newline', () => {
        const target = 'openapi: 3.0.3\npaths:\n  /dimmers: {} # arrange before the gallery opens';
        const paths = yamlAt(readTarget(target), ['paths']);
        expect(isMap(paths)).toBe(true);
        if (!isMap(paths)) throw new Error('Expected a paths mapping');
        const edits = new YamlEdits(target);
        edits.insertMapping(paths, '/spotlights', () => ({}), ['paths', '/spotlights']);
        expect(edits.apply([])).toBe(target + '\n  /spotlights: {}\n');
    });

    it('rejects ambiguous scalar mapping keys and both forms of shared ancestor access', () => {
        const root = readTarget(
            'openapi: 3.0.3\npaths: &paths\n  /dimmers: {}\ncomponent: *paths\nvalues:\n  1: number\n  "1": string\n',
        );
        const values = root.get('values', true);
        if (!isMap(values)) throw new Error('Expected a mapping');
        expect(() => property(values, '1', ['values'])).toThrow('ambiguous YAML mapping key');
        expect(yamlAt(root, ['component', '/dimmers'], false)).toBeUndefined();
        expect(yamlAt(root, ['absent', '/dimmers'])).toBeUndefined();
        expect(() => yamlAt(root, ['paths', '/dimmers'])).toThrow('shared target reference');
    });

    it('supports scalar replacement with newlines and scalar deletion with CRLF', () => {
        const target =
            'openapi: 3.0.3\r\npaths: {}\r\ninfo:\r\n  title: West gallery\r\n  version: autumn-catalog\r\n';
        const root = readTarget(target);
        const info = yamlAt(root, ['info']);
        if (!isMap(info)) throw new Error('Expected an info mapping');
        const title = property(info, 'title', ['info']);
        const version = property(info, 'version', ['info']);
        if (
            !isScalar(title?.key) ||
            !isScalar(title?.value) ||
            !isScalar(version?.key) ||
            !isScalar(version?.value)
        )
            throw new Error('Expected scalar fields');
        const edits = new YamlEdits(target);
        edits.replaceScalar(title.key, title.value, () => 'North gallery\nWorks on paper', [
            'info',
            'title',
        ]);
        edits.omitMapping(version.key, version.value, ['info', 'version']);
        const updated = edits.apply([]);
        expect(updated).toContain(
            'openapi: 3.0.3\r\npaths: {}\r\ninfo:\r\n  title: |-\r\n    North gallery\r\n    Works on paper\r\n',
        );
        const document = parseDocument(updated);
        expect(document.getIn(['info', 'title'])).toBe('North gallery\nWorks on paper');
        expect(document.getIn(['info', 'version'])).toBeUndefined();
    });

    it('rejects flow sequence edits and removal of every entry in a block sequence', () => {
        const target = 'openapi: 3.0.3\npaths: {}\nflow: [one]\nblock:\n  - one\n';
        const root = readTarget(target);
        const edits = new YamlEdits(target);
        const flow = yamlAt(root, ['flow']);
        const block = yamlAt(root, ['block']);
        if (!isSeq(flow) || !isSeq(block)) throw new Error('Expected two sequences');
        expect(() => edits.sequence(flow, 0, 1, ['two'], ['flow'])).toThrow('unsupported YAML');
        expect(() => edits.sequence(block, 0, 1, [], ['block'])).toThrow(
            'emptying a block sequence',
        );
    });

    it('rejects overlapping edits', () => {
        const edits = new YamlEdits('openapi: 3.0.3\npaths: {}\n');
        edits.add(0, 4, () => 'replacement');
        edits.add(2, 4, () => 'overlap');
        expect(() => edits.apply([])).toThrow('overlapping YAML edits');
    });

    it.each([
        ['[broken yaml', 'invalid target YAML'],
        ['openapi: 3.1.0', 'OpenAPI 3.0'],
    ])('rejects malformed target %j', (content, message) =>
        expect(() => readTarget(content)).toThrow(message),
    );
});

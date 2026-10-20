import type {Config} from '~/core/config';
import type {BaseConfig} from '~/core/program';

import {mkdir, mkdtemp, readFile, realpath, rm, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import SwaggerParser from '@apidevtools/swagger-parser';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import {Run} from '~/core/run';

import {prepareOpenapiSources} from './sources';

class SourceRun extends Run {
    readonly input: AbsolutePath;

    constructor(original: AbsolutePath, stage: AbsolutePath) {
        super({input: original} as Config<BaseConfig>);
        this.input = stage;
        this.scopes.set('<origin>', original);
        this.scopes.set('<input>', stage);
        this.sources.configure(original, stage);
    }
}

describe('OpenAPI native file URL conversion', () => {
    let root: AbsolutePath;
    let original: AbsolutePath;
    let stage: AbsolutePath;

    beforeEach(async () => {
        const temporary = await mkdtemp(join(tmpdir(), 'yfm-openapi-url-'));
        root = (await realpath(temporary as AbsolutePath)) as AbsolutePath;
        original = join(root, 'original');
        stage = join(root, 'stage');
        await mkdir(original);
        await mkdir(stage);
    });

    afterEach(async () => {
        await rm(root, {recursive: true, force: true});
    });

    it.each([
        {filename: 'pet name.yaml', fileUrl: false},
        {filename: 'питомец.yaml', fileUrl: false},
        {filename: 'pet name.yaml', fileUrl: true},
        {filename: 'pet%2Fname.yaml', fileUrl: true},
    ])('matches native resolver for $filename, file URL: $fileUrl', async ({filename, fileUrl}) => {
        const target = join(original, filename);
        const reference = fileUrl
            ? pathToFileURL(target).href.replace(/%252F/g, '%2F')
            : encodeURI(filename);
        const content = 'Pet: {type: string}';
        await writeFile(target, content);
        await writeFile(
            join(original, 'spec.yaml'),
            JSON.stringify({
                openapi: '3.0.0',
                info: {title: 'Native encoding', version: '1.0.0'},
                paths: {},
                components: {schemas: {Pet: {$ref: `${reference}#/Pet`}}},
            }),
        );

        const native = await SwaggerParser.resolve(join(original, 'spec.yaml'));
        expect(native.get(`${reference}#/Pet`)).toEqual({type: 'string'});
        const run = new SourceRun(original, stage);
        await prepareOpenapiSources(run, {input: 'spec.yaml'});

        expect(run.sources.dependencies).toContain(target);
        if (!fileUrl) {
            expect(await readFile(join(stage, filename), 'utf8')).toBe(content);
        }
        expect(await readFile(target, 'utf8')).toBe(content);
    });
});

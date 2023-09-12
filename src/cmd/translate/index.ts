import {
    eachLimit,
    retry,
    asyncify,
} from 'async';

import {argvValidator} from '../../validator';
import {dirname, resolve, join} from 'path';
import {readFile, writeFile, mkdir} from 'fs/promises';
import {XMLParser} from 'fast-xml-parser';

import {Session} from '@yandex-cloud/nodejs-sdk/dist/session';
import {TranslationServiceClient} from '@yandex-cloud/nodejs-sdk/dist/generated/yandex/cloud/service_clients';
import {
    TranslateRequest,
    TranslateRequest_Format as Format,
} from '@yandex-cloud/nodejs-sdk/dist/generated/yandex/cloud/ai/translate/v2/translation_service';

const yfm2xliff = require('@doc-tools/yfm2xliff/lib/cjs');

import {ArgvService} from '../../services';
import {getYandexOAuthToken} from '../../packages/credentials';
import {glob, logger} from '../../utils';

import {Argv, Arguments} from 'yargs';

import {YandexCloudTranslateGlossaryPair} from '../../models';

const composer = async (xliff: string, skeleton: string): Promise<string> => new Promise((res, rej) =>
    yfm2xliff.compose(xliff, skeleton, (err: Error, composed: string) => {
        if (err) {
            rej(err);
        }

        return res(composed);
    }));

const command = 'translate';

const description = 'translate documentation with Yandex.Cloud Translator API';

const translate = {
    command,
    description,
    handler,
    builder,
};

const MD_GLOB = '**/*.md';
const REQUESTS_LIMIT = 20;
const RETRY_LIMIT = 8;
const MTRANS_LOCALE = 'MTRANS';

function builder<T>(argv: Argv<T>) {
    return argv
        .option('source-language', {
            alias: 'sl',
            describe: 'source language code',
            type: 'string',
        })
        .option('target-language', {
            alias: 'tl',
            describe: 'target language code',
            type: 'string',
        })
        .check(argvValidator)
        .demandOption(
            ['source-language', 'target-language'],
            'command requires to specify source and target languages');
}

class TranslatorError extends Error {
    path: string;

    constructor(message: string, path: string) {
        super(message);

        this.path = path;
    }
}

/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
async function handler(args: Arguments<any>) {
    ArgvService.init({
        ...args,
    });

    const {input,
        output,
        yandexCloudTranslateFolderId,
        yandexCloudTranslateGlossaryPairs,
        sl: sourceLanguage,
        tl: targetLanguage,
    } = args;

    logger.info(input, `translating documentation from ${sourceLanguage} to ${targetLanguage} language`);

    try {
        let found = [];

        ({state: {found}} = await glob(join(input, MD_GLOB), {
            nosort: true,
        }));

        const oauthToken = await getYandexOAuthToken();

        const translatorParams = {
            input,
            output,
            sourceLanguage,
            targetLanguage,
            yandexCloudTranslateGlossaryPairs,
            folderId: yandexCloudTranslateFolderId,
            oauthToken,
        };

        const translateFn = translator(translatorParams);

        await eachLimit(found, REQUESTS_LIMIT, asyncify(translateFn));
    } catch (err) {
        if (err instanceof Error || err instanceof TranslatorError) {
            const message = err.message;

            const file = err instanceof TranslatorError ? err.path : '';

            logger.error(file, message);
        }
    }

    logger.info(output, `translated documentation from ${sourceLanguage} to ${targetLanguage} language`);
}

export type TranslatorParams = {
    oauthToken: string;
    folderId: string;
    input: string;
    output: string;
    sourceLanguage: string;
    targetLanguage: string;
    yandexCloudTranslateGlossaryPairs: YandexCloudTranslateGlossaryPair[];
};

function translator(params: TranslatorParams) {
    const {
        oauthToken,
        folderId,
        input,
        output,
        sourceLanguage,
        targetLanguage,
        yandexCloudTranslateGlossaryPairs,
    } = params;

    const session = new Session({oauthToken});
    const client = session.client(TranslationServiceClient);

    return async (mdPath: string) => {
        try {
            logger.info(mdPath, 'translating');

            const md = await readFile(resolve(mdPath), {encoding: 'utf-8'});

            const extracted = await yfm2xliff.extract({
                md,
                mdPath,
                source: sourceLanguage,
                target: targetLanguage,
                sklPath: '',
                xlfPath: '',
            });

            const texts = parseSourcesFromXLIFF(extracted.xliff);

            const machineTranslateParams = TranslateRequest.fromPartial({
                texts,
                folderId,
                sourceLanguageCode: sourceLanguage,
                targetLanguageCode: targetLanguage,
                glossaryConfig: {
                    glossaryData: {
                        glossaryPairs: yandexCloudTranslateGlossaryPairs,
                    },
                },
                format: Format.PLAIN_TEXT,
            });

            const translations = await retry({times: RETRY_LIMIT, interval: (count: number) => {
                // eslint-disable-next-line no-bitwise
                return (1 << count) * 1000;
            }}, asyncify(async () =>
                await client.translate(machineTranslateParams)
                    .then((results: {translations: {text: string}[]}) =>
                        results.translations.map(({text}: {text: string}) => text)),
            ));

            const createXLIFFDocumentParams = {
                sourceLanguage: sourceLanguage + '-' + MTRANS_LOCALE,
                targetLanguage: targetLanguage + '-' + MTRANS_LOCALE,
                sources: texts,
                targets: translations as string[],
            };

            const translatedXLIFF = createXLIFFDocument(createXLIFFDocumentParams);

            const composed = await composer(translatedXLIFF, extracted.skeleton);

            const outputPath = mdPath.replace(input, output);

            await mkdir(dirname(outputPath), {recursive: true});
            await writeFile(outputPath, composed);

            logger.info(outputPath, 'finished translating');
        } catch (err) {
            if (err instanceof Error) {
                throw new TranslatorError(err.toString(), mdPath);
            }
        }
    };
}

function parseSourcesFromXLIFF(xliff: string) {
    const parser = new XMLParser();

    const inputs = parser.parse(xliff)?.xliff?.file?.body['trans-unit'] ?? [];

    return Array.isArray(inputs)
        ? inputs.map(({source}: {source: string}) => source)
        : [inputs.source];
}

export type CreateXLIFFDocumentParams = {
    sourceLanguage: string;
    targetLanguage: string;
    sources: string[];
    targets: string[];
};

function createXLIFFDocument(params: CreateXLIFFDocumentParams) {
    const {sourceLanguage, targetLanguage, sources, targets} = params;

    const unit = (text: string, i: number): string => `
<trans-unit id="${i + 1}">
    <source xml:lang="${sourceLanguage}">${sources[i]}</source>
    <target xml:lang="${targetLanguage}">${text}</target>
</trans-unit>`;

    const doc = `
<?xml version="1.0" encoding="UTF-8"?>
<xliff xmlns="urn:oasis:names:tc:xliff:document:1.2" version="1.2">
    <file original="" source-language="${sourceLanguage}" target-language="${targetLanguage}">
        <header>
            <skl><external-file href="" /></skl>
        </header>
        <body>${targets.map(unit)}</body>
    </file>
</xliff>`;

    return doc;
}

export {translate};

export default {translate};

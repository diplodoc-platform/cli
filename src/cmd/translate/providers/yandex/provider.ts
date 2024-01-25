import type {TranslateConfig} from '~/cmd/translate';
import type {YandexTranslationConfig} from '.';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import glob from 'glob';
import {asyncify, eachLimit, retry} from 'async';
import {XMLParser} from 'fast-xml-parser';
import {Session} from '@yandex-cloud/nodejs-sdk/dist/session';
import {TranslationServiceClient} from '@yandex-cloud/nodejs-sdk/dist/generated/yandex/cloud/service_clients';
import {
    TranslateRequest_Format as Format,
    TranslateRequest,
} from '@yandex-cloud/nodejs-sdk/dist/generated/yandex/cloud/ai/translate/v2/translation_service';

import {compose, extract} from '@diplodoc/markdown-translation';
import {LogLevel, Logger, Writer} from '~/logger';

const REQUESTS_LIMIT = 20;
const BYTES_LIMIT = 10000;
const RETRY_LIMIT = 3;
const MTRANS_LOCALE = 'MTRANS';

class TranslateLogger extends Logger {
    translating: Writer;
    translated: Writer;

    constructor(config: TranslateConfig) {
        super(config);

        this.translating = this.topic(LogLevel.INFO, 'TRANSLATING');
        this.translated = this.topic(LogLevel.INFO, 'TRANSLATED');
    }
}

class TranslateError extends Error {
    path: string;

    constructor(message: string, path: string) {
        super(message);

        this.path = path;
    }
}

export class Provider {
    readonly logger: TranslateLogger;

    constructor(config: TranslateConfig) {
        this.logger = new TranslateLogger(config);
    }

    async translate(config: TranslateConfig & YandexTranslationConfig) {
        const {input, oauthToken, folderId, glossaryPairs, sourceLanguage, targetLanguage} = config;
        const files = glob.sync('**/.md', {cwd: input, nodir: true});

        const session = new Session({oauthToken});
        const client = session.client(TranslationServiceClient);
        const request = (texts: string[]) => () =>
            client
                .translate(
                    TranslateRequest.fromPartial({
                        texts,
                        folderId,
                        sourceLanguageCode: sourceLanguage,
                        targetLanguageCode: targetLanguage,
                        glossaryConfig: {
                            glossaryData: {glossaryPairs},
                        },
                        format: Format.PLAIN_TEXT,
                    }),
                )
                .then((results) => results.translations.map(({text}) => text));

        await eachLimit(files, REQUESTS_LIMIT, (path) => this.translateFile(path, request, config));
    }

    private async translateFile(
        mdPath: string,
        request: (texts: string[]) => () => Promise<string[]>,
        config: TranslateConfig & YandexTranslationConfig,
    ) {
        const {input, output, sourceLanguage, targetLanguage} = config;

        try {
            this.logger.translating(mdPath);

            const md = await readFile(resolve(input, mdPath), {encoding: 'utf-8'});

            const {xlf, skeleton} = extract({
                source: {
                    language: sourceLanguage,
                    locale: 'US',
                },
                target: {
                    language: targetLanguage,
                    locale: 'US',
                },
                markdown: md,
                markdownPath: mdPath,
                skeletonPath: '',
            });

            const texts = parseSourcesFromXLIFF(xlf);

            const parts = await Promise.all(
                texts.reduce(
                    (
                        {
                            promises,
                            buffer,
                            bufferSize,
                        }: {
                            promises: Promise<string[]>[];
                            buffer: string[];
                            bufferSize: number;
                        },
                        text,
                        index,
                    ) => {
                        if (text.length >= BYTES_LIMIT) {
                            this.logger.warn(
                                mdPath,
                                'Skip document part for translation. Part is too big.',
                            );
                            promises.push(Promise.resolve([text]));
                            return {promises, buffer, bufferSize};
                        }

                        if (bufferSize + text.length > BYTES_LIMIT || index === texts.length - 1) {
                            promises.push(backoff(request(buffer)));
                            buffer = [];
                            bufferSize = 0;
                        }

                        buffer.push(text);
                        bufferSize += text.length;

                        return {promises, buffer, bufferSize};
                    },
                    {
                        promises: [],
                        buffer: [],
                        bufferSize: 0,
                    },
                ).promises,
            );

            const translations = ([] as string[]).concat(...parts);

            const translatedXLIFF = createXLIFFDocument({
                sourceLanguage: sourceLanguage + '-' + MTRANS_LOCALE,
                targetLanguage: targetLanguage + '-' + MTRANS_LOCALE,
                sources: texts,
                targets: translations,
            });

            const composed = await compose({
                xlf: translatedXLIFF,
                skeleton,
            });

            const outputPath = mdPath.replace(input, output);

            await mkdir(dirname(outputPath), {recursive: true});
            await writeFile(outputPath, composed);

            this.logger.translated(mdPath);
        } catch (err) {
            if (err instanceof Error) {
                throw new TranslateError(err.toString(), mdPath);
            }
        }
    }
}

function backoff(action: () => Promise<string[]>): Promise<string[]> {
    return retry(
        {
            times: RETRY_LIMIT,
            interval: (count: number) => {
                // eslint-disable-next-line no-bitwise
                return (1 << count) * 1000;
            },
        },
        asyncify(action),
    );
}

function parseSourcesFromXLIFF(xliff: string): string[] {
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

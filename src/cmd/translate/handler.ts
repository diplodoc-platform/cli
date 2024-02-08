import {Arguments} from 'yargs';
import {ArgvService} from '../../services';
import {logger} from '../../utils';
import {ok} from 'assert';
import {basename, dirname, join, resolve} from 'path';
import glob from 'glob';
import {getYandexOAuthToken} from '../../packages/credentials';
import {asyncify, eachLimit, retry} from 'async';
import {Session} from '@yandex-cloud/nodejs-sdk/dist/session';
import {TranslationServiceClient} from '@yandex-cloud/nodejs-sdk/dist/generated/yandex/cloud/service_clients';
import {
    TranslateRequest_Format as Format,
    TranslateRequest,
} from '@yandex-cloud/nodejs-sdk/dist/generated/yandex/cloud/ai/translate/v2/translation_service';
import {mkdir, readFile, writeFile} from 'fs/promises';

// @ts-ignore
import {compose, extract} from '@diplodoc/markdown-translation';

const REQUESTS_LIMIT = 20;
const BYTES_LIMIT = 10000;
const RETRY_LIMIT = 3;

class TranslatorError extends Error {
    path: string;

    constructor(message: string, path: string) {
        super(message);

        this.path = path;
    }
}

type TranslateConfig = {
    input: string;
    output?: string;
    sourceLanguage: string;
    targetLanguage: string;
    folderId?: string;
    glossary?: string;
    include?: string[];
    exclude?: string[];
};

export async function handler(args: Arguments<any>) {
    ArgvService.init({
        ...(args.translate || {}),
        ...args,
    });

    const {
        folderId,
        // yandexCloudTranslateGlossaryPairs,
        sourceLanguage,
        targetLanguage,
        exclude = [],
    } = ArgvService.getConfig() as unknown as TranslateConfig;

    let {input, output, include = []} = ArgvService.getConfig() as unknown as TranslateConfig;

    logger.info(
        input,
        `translating documentation from ${sourceLanguage} to ${targetLanguage} language`,
    );

    output = output || input;

    ok(input, 'Required param input is not configured');
    ok(sourceLanguage, 'Required param sourceLanguage is not configured');
    ok(targetLanguage, 'Required param targetLanguage is not configured');

    try {
        if (input.endsWith('.md')) {
            include = [basename(input)];
            input = dirname(input);
        } else if (!include.length) {
            include.push('**/*');
        }

        const files = ([] as string[]).concat(
            ...include.map((match) =>
                glob.sync(match, {
                    cwd: join(input, sourceLanguage),
                    ignore: exclude,
                }),
            ),
        );
        const found = [...new Set(files)];

        const oauthToken = await getYandexOAuthToken();

        const translatorParams = {
            input,
            output,
            sourceLanguage,
            targetLanguage,
            // yandexCloudTranslateGlossaryPairs,
            folderId,
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

    logger.info(
        output,
        `translated documentation from ${sourceLanguage} to ${targetLanguage} language`,
    );
}

export type TranslatorParams = {
    oauthToken: string;
    folderId: string | undefined;
    input: string;
    output: string;
    sourceLanguage: string;
    targetLanguage: string;
    // yandexCloudTranslateGlossaryPairs: YandexCloudTranslateGlossaryPair[];
};

function translator(params: TranslatorParams) {
    const {
        oauthToken,
        folderId,
        input,
        output,
        sourceLanguage,
        targetLanguage,
        // yandexCloudTranslateGlossaryPairs,
    } = params;

    const tmap = new Map<string, Defer>();
    const session = new Session({oauthToken});
    const client = session.client(TranslationServiceClient);
    const request = (texts: string[]) => () => {
        return client
            .translate(
                TranslateRequest.fromPartial({
                    texts,
                    folderId,
                    sourceLanguageCode: sourceLanguage,
                    targetLanguageCode: targetLanguage,
                    // glossaryConfig: {
                    //     glossaryData: {
                    //         glossaryPairs: yandexCloudTranslateGlossaryPairs,
                    //     },
                    // },
                    format: Format.HTML,
                }),
            )
            .then((results) => {
                return results.translations.map(({text}, index) => {
                    const defer = tmap.get(texts[index]);
                    if (defer) {
                        defer.resolve([text]);
                    }

                    return text;
                });
            });
    };

    return async (mdPath: string) => {
        if (!mdPath.endsWith('.md')) {
            return;
        }

        try {
            logger.info(mdPath, 'translating');

            const inputPath = resolve(input, sourceLanguage, mdPath);
            const outputPath = resolve(output, targetLanguage, mdPath);
            const md = await readFile(inputPath, {encoding: 'utf-8'});

            await mkdir(dirname(outputPath), {recursive: true});

            if (!md) {
                await writeFile(outputPath, md);
                return;
            }

            const {units, skeleton} = extract({
                source: {
                    language: sourceLanguage,
                    locale: 'RU',
                },
                target: {
                    language: targetLanguage,
                    locale: 'US',
                },
                markdown: md,
                markdownPath: mdPath,
                skeletonPath: '',
            });

            if (!units.length) {
                await writeFile(outputPath, md);
                return;
            }

            const parts = await Promise.all(
                (units as string[]).reduce(
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
                            logger.warn(
                                mdPath,
                                'Skip document part for translation. Part is too big.',
                            );
                            promises.push(Promise.resolve([text]));
                            return {promises, buffer, bufferSize};
                        }

                        const defer = tmap.get(text);
                        if (defer) {
                            console.log('SKIPPED', text);
                            promises.push(defer.promise);
                            return {promises, buffer, bufferSize};
                        }

                        if (bufferSize + text.length > BYTES_LIMIT) {
                            promises.push(backoff(request(buffer)));
                            buffer = [];
                            bufferSize = 0;
                        }

                        buffer.push(text);
                        bufferSize += text.length;
                        tmap.set(text, new Defer());

                        if (index === units.length - 1) {
                            promises.push(backoff(request(buffer)));
                        }

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

            const composed = await compose({
                useSource: true,
                units: translations,
                skeleton,
            });

            await writeFile(outputPath, composed);

            logger.info(outputPath, 'finished translating');
        } catch (err) {
            if (err instanceof Error) {
                throw new TranslatorError(err.toString(), mdPath);
            }
        }
    };
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

class Defer {
    resolve!: (text: string[]) => void;

    reject!: (error: any) => void;

    promise: Promise<string[]>;

    constructor() {
        this.promise = new Promise((resolve, reject) => {
            this.resolve = resolve;
            this.reject = reject;
        });
    }
}

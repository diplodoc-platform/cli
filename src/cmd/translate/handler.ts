import axios from 'axios';
import {Arguments} from 'yargs';
import {ArgvService} from '../../services';
import {logger} from '../../utils';
import {ok} from 'assert';
import {dirname, extname, join, resolve} from 'path';
import {mkdir} from 'fs/promises';
import {getYandexAuth} from './yandex/auth';
import {asyncify, eachLimit, retry} from 'async';

import {
    Defer,
    TranslateParams,
    bytes,
    compose,
    dumpFile,
    extract,
    loadFile,
    normalizeParams,
} from './utils';

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

class RequestError extends Error {
    code: string;

    constructor(error: Error) {
        super(error?.message || String(error));
        this.code = 'REQUEST_ERROR';
    }
}

export async function handler(args: Arguments<any>) {
    const params = normalizeParams({
        ...(args.translate || {}),
        ...args,
    });

    ArgvService.init(params);

    const {input, output, auth, folder, source, targets, files, dryRun} =
        ArgvService.getConfig() as unknown as TranslateParams;

    ok(auth, 'Required param auth is not configured');
    ok(folder, 'Required param folder is not configured');
    ok(source, `Required param source is not configured`);
    ok(targets.length, `Required param target is not configured`);

    try {
        const authInfo = getYandexAuth(auth);

        for (const target of targets) {
            const translatorParams = {
                input,
                output,
                sourceLanguage: source[0],
                targetLanguage: target[0],
                // yandexCloudTranslateGlossaryPairs,
                folderId: folder,
                auth: authInfo,
                dryRun,
            };

            const cache = new Map<string, Defer>();
            const request = requester(translatorParams, cache);
            const split = splitter(request, cache);
            const translate = translator(translatorParams, split);

            await eachLimit(
                files,
                REQUESTS_LIMIT,
                asyncify(async function (file: string) {
                    try {
                        await translate(file);
                    } catch (error: any) {
                        logger.error(file, error.message);
                    }
                }),
            );

            console.log('PROCESSED', `bytes: ${request.stat.bytes} chunks: ${request.stat.chunks}`);
        }
    } catch (error: any) {
        const message = error.message;

        const file = error instanceof TranslatorError ? error.path : '';

        logger.error(file, message);
    }
}

type TranslatorParams = {
    input: string;
    output: string;
    sourceLanguage: string;
    targetLanguage: string;
    // yandexCloudTranslateGlossaryPairs: YandexCloudTranslateGlossaryPair[];
};

type RequesterParams = {
    auth: string;
    folderId: string | undefined;
    sourceLanguage: string;
    targetLanguage: string;
    dryRun: boolean;
};

type Request = {
    (texts: string[]): () => Promise<string[]>;
    stat: {
        bytes: number;
        chunks: number;
    };
};

type Split = (path: string, texts: string[]) => Promise<string>[];

type Cache = Map<string, Defer>;

type Translations = {
    translations: {
        text: string;
    }[];
};

function requester(params: RequesterParams, cache: Cache) {
    const {auth, folderId, sourceLanguage, targetLanguage, dryRun} = params;
    const resolve = (text: string, index: number, texts: string[]) => {
        const defer = cache.get(texts[index]);
        if (defer) {
            defer.resolve(text);
        }
        return text;
    };

    const request = function request(texts: string[]) {
        request.stat.bytes += bytes(texts);
        request.stat.chunks++;

        return async function () {
            if (dryRun) {
                return texts.map(resolve);
            }

            return axios({
                method: 'POST',
                url: 'https://translate.api.cloud.yandex.net/translate/v2/translate',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: auth,
                },
                data: {
                    folderId,
                    texts,
                    sourceLanguageCode: sourceLanguage,
                    targetLanguageCode: targetLanguage,
                    format: 'HTML',
                },
            })
                .then(({data, status}) => {
                    if (status === 200) {
                        return data;
                    } else {
                        throw new Error(data.message);
                    }
                })
                .then((result: Translations) => {
                    return result.translations.map(({text}, index) => {
                        return resolve(text, index, texts);
                    });
                })
                .catch((error) => {
                    console.error(error);
                    throw new RequestError(error);
                });
        };
    };

    request.stat = {
        bytes: 0,
        chunks: 0,
    };

    return request;
}

function translator(params: TranslatorParams, split: Split) {
    const {input, output, sourceLanguage, targetLanguage} = params;
    const inputRoot = resolve(input);
    const outputRoot = resolve(output);

    return async (path: string) => {
        const ext = extname(path);
        if (!['.yaml', '.json', '.md'].includes(ext)) {
            return;
        }

        const inputPath = join(inputRoot, path);
        const outputPath = join(outputRoot, path.replace(sourceLanguage, targetLanguage));
        const content = await loadFile(inputPath);

        await mkdir(dirname(outputPath), {recursive: true});

        if (!content) {
            await dumpFile(outputPath, content);
            return;
        }

        const {units, skeleton} = extract(content, {
            source: {
                language: sourceLanguage,
                locale: 'RU',
            },
            target: {
                language: targetLanguage,
                locale: 'US',
            },
        });

        if (!units.length) {
            await dumpFile(outputPath, content);
            return;
        }

        const parts = await Promise.all(split(path, units));
        const composed = compose(skeleton, parts, {useSource: true});

        await dumpFile(outputPath, composed);
    };
}

function splitter(request: Request, cache: Cache): Split {
    return function (path: string, texts: string[]) {
        const promises: Promise<string>[] = [];
        let buffer: string[] = [];
        let bufferSize = 0;

        const release = () => {
            backoff(request(buffer));
            buffer = [];
            bufferSize = 0;
        };

        for (const text of texts) {
            if (text.length >= BYTES_LIMIT) {
                logger.warn(path, 'Skip document part for translation. Part is too big.');
                promises.push(Promise.resolve(text));
            } else {
                const defer = cache.get(text) || new Defer();
                promises.push(defer.promise);

                if (!cache.get(text)) {
                    if (bufferSize + text.length > BYTES_LIMIT) {
                        release();
                    }

                    buffer.push(text);
                    bufferSize += text.length;
                }

                cache.set(text, defer);
            }
        }

        if (bufferSize) {
            release();
        }

        return promises;
    };
}

function backoff(action: () => Promise<string[]>): Promise<string[]> {
    return retry(
        {
            times: RETRY_LIMIT,
            interval: (count: number) => Math.pow(2, count) * 1000,
        },
        asyncify(action),
    );
}

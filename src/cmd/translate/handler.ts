import axios, {AxiosError, AxiosResponse} from 'axios';
import {green, red} from 'chalk';
import {Arguments} from 'yargs';
import {ArgvService} from '../../services';
import {logger} from '../../utils';
import {ok} from 'assert';
import {dirname, extname, join, resolve} from 'path';
import {mkdir} from 'fs/promises';
import {getYandexAuth} from './yandex/auth';
import {asyncify, eachLimit} from 'async';

import {
    AuthError,
    Defer,
    LimitExceed,
    RequestError,
    TranslateError,
    TranslateParams,
    bytes,
    compose,
    dumpFile,
    extract,
    loadFile,
    normalizeParams,
    resolveSchemas,
} from './utils';

const REQUESTS_LIMIT = 20;
const BYTES_LIMIT = 10000;
const RETRY_LIMIT = 3;

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
    (texts: string[]): () => Promise<void>;
    stat: {
        bytes: number;
        chunks: number;
    };
};

type Split = (path: string, texts: string[]) => Promise<string[]>;

type Cache = Map<string, Defer>;

type Translations = {
    translations: {
        text: string;
    }[];
};

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
                        if (error instanceof TranslateError) {
                            logger.error(file, `${error.message}`, error.code);

                            if (error.fatal) {
                                process.exit(1);
                            }
                        } else {
                            logger.error(file, error.message);
                        }
                    }
                }),
            );

            console.log(
                green('PROCESSED'),
                `bytes: ${request.stat.bytes} chunks: ${request.stat.chunks}`,
            );
        }
    } catch (error: any) {
        if (error instanceof TranslateError) {
            console.error(red(error.code), error.message);
        } else {
            console.error(error);
        }

        process.exit(1);
    }
}

function scheduler(limit: number, interval: number) {
    const scheduled: Defer<void>[] = [];

    let processing = 0;

    function idle() {
        const defer = new Defer<void>();

        scheduled.push(defer);

        return defer.promise;
    }

    async function queue() {
        processing++;
        await wait(interval);
        processing--;
        unqueue();
    }

    async function unqueue() {
        scheduled.shift()?.resolve();
    }

    return async function <R>(action: Function): Promise<R> {
        if (processing >= limit) {
            await idle();
        }

        queue();

        return action();
    };
}

function requester(params: RequesterParams, cache: Cache) {
    const {auth, folderId, sourceLanguage, targetLanguage, dryRun} = params;
    const schedule = scheduler(REQUESTS_LIMIT, 1000);

    const request = function request(texts: string[]) {
        const resolve = (text: string, index: number) => {
            const defer = cache.get(texts[index]);
            if (defer) {
                defer.resolve(text);
            }
        };

        request.stat.bytes += bytes(texts);
        request.stat.chunks++;

        return async function () {
            if (dryRun) {
                texts.forEach(resolve);
            }

            try {
                const {data} = await schedule<AxiosResponse<Translations>>(() =>
                    axios({
                        method: 'POST',
                        url: 'https://translate.api.cloud.yandex.net/translate/v2/translate',
                        timeout: 5000,
                        maxRedirects: 0,
                        headers: {
                            Authorization: auth,
                            'Content-Type': 'application/json',
                            'User-Agent': 'github.com/diplodoc-platform/cli',
                        },
                        data: {
                            folderId,
                            texts,
                            sourceLanguageCode: sourceLanguage,
                            targetLanguageCode: targetLanguage,
                            format: 'HTML',
                        },
                    }),
                );

                return data.translations.map(({text}) => text).forEach(resolve);
            } catch (error: any) {
                if (error instanceof AxiosError) {
                    const {response} = error;
                    const {status, statusText, data} = response as AxiosResponse;

                    switch (true) {
                        case LimitExceed.is(data.message):
                            throw new LimitExceed(data.message);
                        case AuthError.is(data.message):
                            throw new AuthError(data.message);
                        default:
                            throw new RequestError(status, statusText, data);
                    }
                }

                throw new RequestError(0, error.message, {fatal: true});
            }
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

        const schemas = await resolveSchemas(path);
        const {units, skeleton} = extract(content, {
            compact: true,
            source: {
                language: sourceLanguage,
                locale: 'RU',
            },
            target: {
                language: targetLanguage,
                locale: 'US',
            },
            schemas,
        });

        if (!units.length) {
            await dumpFile(outputPath, content);
            return;
        }

        const parts = await split(path, units);
        const composed = compose(skeleton, parts, {useSource: true, schemas});

        await dumpFile(outputPath, composed);
    };
}

function splitter(request: Request, cache: Cache): Split {
    return async function (path: string, texts: string[]) {
        const promises: Promise<string>[] = [];
        const requests: Promise<void>[] = [];
        let buffer: string[] = [];
        let bufferSize = 0;

        const release = () => {
            requests.push(backoff(request(buffer)));
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

        await Promise.all(requests);

        return Promise.all(promises);
    };
}

function wait(interval: number) {
    const defer = new Defer<void>();
    setTimeout(() => defer.resolve(), interval);
    return defer.promise;
}

async function backoff(action: () => Promise<void>): Promise<void> {
    let retry = 0;

    while (++retry < RETRY_LIMIT) {
        try {
            await action();
        } catch (error: any) {
            if (RequestError.canRetry(error)) {
                await wait(Math.pow(2, retry) * 1000);
            } else {
                throw error;
            }
        }
    }
}

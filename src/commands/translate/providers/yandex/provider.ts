import type {TranslateConfig} from '~/commands/translate';
import type {YandexTranslationConfig} from '.';
import {extname, join, resolve} from 'node:path';
import {asyncify, eachLimit} from 'async';
import axios, {AxiosError, AxiosResponse} from 'axios';
import {LogLevel, Logger} from '~/logger';
import {FileLoader, TranslateError, compose, extract, resolveSchemas} from '../../utils';
import {AuthError, Defer, LimitExceed, RequestError, bytes} from './utils';
import liquid from '@diplodoc/transform/lib/liquid';
import {TranslateLogger} from '../../logger';

const REQUESTS_LIMIT = 15;
const BYTES_LIMIT = 10000;
const RETRY_LIMIT = 3;

const onFatalError = () => {
    process.exit(1);
};

export class Provider {
    readonly logger: TranslateLogger;

    constructor(config: TranslateConfig) {
        this.logger = new TranslateLogger(config);
    }

    async skip(skipped: [string, string][]) {
        this.logger.skipped(skipped);
    }

    async translate(files: string[], config: TranslateConfig & YandexTranslationConfig) {
        const {input, output, auth, folder, source, target: targets, vars, dryRun} = config;

        try {
            for (const target of targets) {
                const translatorParams = {
                    input,
                    output,
                    auth,
                    sourceLanguage: source.language,
                    targetLanguage: target.language,
                    // yandexCloudTranslateGlossaryPairs,
                    folderId: folder,
                    vars,
                    dryRun,
                };

                const cache = new Map<string, Defer>();
                const request = requester(translatorParams, cache);
                const translate = translator(request, cache, this.logger);
                const process = processor(translatorParams, translate);

                await eachLimit(
                    files,
                    REQUESTS_LIMIT,
                    asyncify(async (file: string) => {
                        try {
                            this.logger.translate(file);
                            await process(file);
                            if (!dryRun) {
                                this.logger.translated(file);
                            }
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        } catch (error: any) {
                            if (error instanceof TranslateError) {
                                this.logger.error(file, `${error.message}`, error.code);

                                if (error.fatal) {
                                    onFatalError();
                                }
                            } else {
                                this.logger.error(file, error.message);
                            }
                        }
                    }),
                );

                this.logger.stat(`bytes: ${request.stat.bytes} chunks: ${request.stat.chunks}`);
            }
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (error: any) {
            if (error instanceof TranslateError) {
                this.logger.topic(LogLevel.ERROR, error.code)(error.message);
            } else {
                this.logger.error(error);
            }

            process.exit(1);
        }
    }
}

type TranslatorParams = {
    input: string;
    output: string;
    sourceLanguage: string;
    targetLanguage: string;
    vars: Record<string, any>;
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

type Translate = (path: string, texts: string[]) => Promise<string[]>;

type Cache = Map<string, Defer>;

type Translations = {
    translations: {
        text: string;
    }[];
};

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
                return;
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
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } catch (error: any) {
                if (error instanceof AxiosError) {
                    const {response} = error;

                    if (response) {
                        const {status, statusText, data} = response as AxiosResponse;

                        switch (true) {
                            case LimitExceed.is(data.message):
                                throw new LimitExceed(data.message);
                            case AuthError.is(data.message):
                                throw new AuthError(data.message);
                            default:
                                throw new RequestError(status, statusText, data);
                        }
                    } else {
                        console.error(error.code);
                        console.error(error.cause);
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

function processor(params: TranslatorParams, translate: Translate) {
    const {input, output, sourceLanguage, targetLanguage, vars} = params;
    const inputRoot = resolve(input);
    const outputRoot = resolve(output);

    return async function (path: string) {
        const ext = extname(path);
        if (!['.yaml', '.md'].includes(ext)) {
            return;
        }

        const inputPath = join(inputRoot, path);
        const output = (path: string) =>
            join(
                outputRoot,
                path
                    .replace(inputRoot, '')
                    .replace('/' + sourceLanguage + '/', '/' + targetLanguage + '/'),
            );

        const content = new FileLoader(inputPath);

        await content.load();

        if (Object.keys(vars).length && content.isString) {
            content.set(
                liquid(content.data as string, vars, inputPath, {
                    conditions: 'strict',
                    substitutions: false,
                    cycles: false,
                }),
            );
        }

        if (!content.data) {
            await content.dump(output);
            return;
        }

        const schemas = await resolveSchemas(path);
        const {units, skeleton} = extract(content.data, {
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
            await content.dump(output);
            return;
        }

        const parts = await translate(path, units);

        content.set(compose(skeleton, parts, {useSource: true, schemas}));

        await content.dump(output);
    };
}

function translator(request: Request, cache: Cache, logger: Logger): Translate {
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
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (error: any) {
            if (RequestError.canRetry(error)) {
                await wait(Math.pow(2, retry) * 1000);
            } else {
                throw error;
            }
        }
    }
}

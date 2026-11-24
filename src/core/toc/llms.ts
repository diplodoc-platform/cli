import type {Toc, TocLlmsConfig} from './types';

/** Resolves LLMS metadata independently for each TOC; empty strings clear a default. */
export function resolveLlmsConfig<Config extends TocLlmsConfig>(
    config: Config,
    toc: Pick<Toc, 'llms'>,
): Config {
    return {
        ...config,
        description: toc.llms?.description ?? config.description,
        details: toc.llms?.details ?? config.details,
        url: toc.llms?.url ?? config.url,
    };
}

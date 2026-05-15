type CrawlerExclude = {
    url?: unknown;
    regexp?: unknown;
};

export type CrawlerExcludeConfig = {
    crawler?: {
        exclude?: CrawlerExclude;
    };
    'docs-viewer'?: {
        crawler?: {
            exclude?: CrawlerExclude;
        };
    };
};

type CrawlerExclude = {
    url?: unknown;
    regexp?: unknown;
};

export type CrawlerNotifications = {
    channels?: string[];
    interval?: 'daily' | 'weekly' | 'monthly';
    receivers: string[];
};

export type CrawlerConfig = {
    crawler?: {
        notifications?: CrawlerNotifications;
        exclude?: CrawlerExclude;
    };
    'docs-viewer'?: {
        crawler?: {
            notifications?: CrawlerNotifications;
            exclude?: CrawlerExclude;
        };
    };
};

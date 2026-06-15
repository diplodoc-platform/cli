type CrawlerExclude = {
    url?: unknown;
    regexp?: unknown;
};

export type CrawlerNotifications = {
    interval?: 'daily' | 'weekly' | 'monthly';
    emailReceivers?: string[];
    messengerReceivers?: string[];
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

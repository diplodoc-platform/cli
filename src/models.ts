import {Stage} from './constants';

export type VarsPreset = 'internal'|'external';

export type YfmPreset = Record<string, string>;

export interface YfmConfig {
    varsPreset: VarsPreset;
    ignore: string[];
    outputFormat: string;
    allowHTML: string;
    vars: Record<string, string>;
    applyPresets: boolean;
    strict: boolean;
    ignoreStage: string;
}

export interface YfmArgv extends YfmConfig {
    input: string;
    output: string;
    quiet: string;
    publish: boolean;
    storageEndpoint: string;
    storageBucket: string;
    storagePrefix: string;
    storageKeyId: string;
    storageSecretKey: string;
}

export interface DocPreset {
    default: YfmPreset;
    [varsPreset: string]: YfmPreset;
}

export interface YfmToc extends Filter {
    name: string;
    href: string;
    items: YfmToc[];
    stage?: Stage;
    base?: string;
    title?: string;
    include: YfmTocInclude;
    id?: string;
}

export interface YfmTocInclude {
    repo: string;
    path: string;
}

export interface LeadingPage {
    title: string;
    description?: string;
    meta?: {
        title?: string;
        noIndex?: boolean;
    };
    links: LeadingPageLinks[];
}

export interface LeadingPageLinks extends Filter {
    title?: string;
    description?: string;
    href?: string;
}

export interface Filter {
    when?: boolean|string;
    [key: string]: any;
}

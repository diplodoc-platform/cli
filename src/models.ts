import {Logger} from '@diplodoc/transform/lib/log';
import {ChangelogItem} from '@diplodoc/transform/lib/plugins/changelog/types';
import {LintConfig} from '@diplodoc/transform/lib/yfmlint';

import {ResourceType} from './constants';

export type VarsMetadata = {
    [field: string]: string;
}[];

export type YfmPreset = Record<string, string> & {
    __metadata?: VarsMetadata;
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Metadata = Record<string, any>;

interface YfmConfig {
    outputFormat: string;
    allowHTML: boolean;
    applyPresets: boolean;
    resolveConditions: boolean;
    conditionsInCode: boolean;
    disableLiquid: boolean;
    singlePage: boolean;
    included: boolean;
    lang?: string;
    langs?: string[];
    lintDisabled: boolean;
    lintConfig: LintConfig;
    needToSanitizeHtml: boolean;
    /**
     * false -> not extract changelogs after build md2md
     * true -> extract changelogs
     * <URL> -> extract and push to s3
     */
    changelogs: string | boolean;
    useLegacyConditions?: boolean;
}

export interface YfmArgv extends YfmConfig {
    rootInput: string;
    input: string;
    output: string;
    contributors: boolean;
    ignoreAuthorPatterns: string[];
    allowCustomResources: boolean;
    staticContent: boolean;
}

export interface LeadingPage {
    title: TextItems;
    description?: TextItems;
    meta?: {
        title?: TextItems;
        description?: TextItems;
        noIndex?: boolean;
    };
    nav?: {
        title: TextItems;
    };
    links: LeadingPageLinks[];
}

export type TextItems = string | (TextItem | string)[];

export interface TextItem extends Filter {
    text: string | string[];
}

export interface LeadingPageLinks extends Filter {
    title?: string;
    description?: string;
    href?: string;
}

export interface Filter {
    when?: boolean | string;
    [key: string]: unknown;
}

export interface SinglePageResult {
    path: string;
    content: string;
    title?: string;
}

export interface Contributor {
    avatar: string;
    email: string;
    login: string;
    name: string;
    url: string;
}

export interface Contributors {
    [email: string]: Contributor;
}

export interface PluginOptions {
    vars: YfmPreset;
    path: AbsolutePath;
    log: Logger;
    copyFile: (targetPath: string, targetDestPath: string, options?: PluginOptions) => void;
    singlePage?: boolean;
    root?: string;
    destPath?: string;
    destRoot?: string;
    changelogs?: ChangelogItem[];
    extractChangelogs?: boolean;
    included?: boolean;
}

export interface Plugin {
    collect: (input: string, options: PluginOptions) => string | void;
}

export type Resources = Partial<Record<Exclude<ResourceType, 'csp'>, string[]>> & {
    csp?: Record<string, string[]>[];
};

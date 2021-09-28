import {Logger} from '@doc-tools/transform/lib/log';

import {FileContributors, VCSConnector, VCSConnectorConfig} from './vcs-connector/connector-models';
import {Lang, Stage} from './constants';

export type VarsPreset = 'internal'|'external';

export type YfmPreset = Record<string, string>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Metadata = Record<string, any>;

export type ContributorsByPathFunction = (path: string) => Promise<FileContributors>;
export type NestedContributorsForPathFunction = (path: string, nestedContributors: Contributors) => void;
export type UserByLoginFunction = (login: string) => Promise<Contributor | null>;
export type CollectionOfPluginsFunction = (output: string, options: PluginOptions) => string;

interface YfmConfig {
    varsPreset: VarsPreset;
    ignore: string[];
    outputFormat: string;
    allowHTML: string;
    vars: Record<string, string>;
    applyPresets: boolean;
    resolveConditions: boolean;
    disableLiquid: boolean;
    strict: boolean;
    ignoreStage: string;
    singlePage: boolean;
    removeHiddenTocItems: boolean;
    connector?: VCSConnectorConfig;
    lang?: Lang;
}

export interface YfmArgv extends YfmConfig {
    rootInput: string;
    input: string;
    output: string;
    quiet: string;
    publish: boolean;
    storageEndpoint: string;
    storageBucket: string;
    storagePrefix: string;
    storageKeyId: string;
    storageSecretKey: string;
    contributors: boolean;
    addSystemMeta: boolean;
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
    include?: YfmTocInclude;
    id?: string;
    singlePage?: boolean;
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
    [key: string]: unknown;
}

export interface SinglePageResult {
    path: string;
    content: string;
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

export interface FileData {
    tmpInputFilePath: string;
    inputFolderPathLength: number;
    fileContent: string;
}

export interface MetaDataOptions {
    fileData: FileData;
    isContributorsEnabled?: boolean;
    vcsConnector?: VCSConnector;
    addSystemMeta?: boolean;
}

export interface PluginOptions {
    vars: YfmPreset;
    path: string;
    log: Logger;
    copyFile: (targetPath: string, targetDestPath: string, options?: PluginOptions) => void;
    singlePage?: boolean;
    root?: string;
    destPath?: string;
    destRoot?: string;
    collectOfPlugins?: (input: string, options: PluginOptions) => string;
}

export interface Plugin {
    collect: (input: string, options: PluginOptions) => string | void;
}

export interface ResolveMd2MdOptions {
    inputPath: string;
    outputPath: string;
    singlePage?: boolean;
    metadata?: MetaDataOptions;
}

export interface ResolverOptions {
    inputPath: string;
    filename: string;
    fileExtension: string;
    outputPath: string;
    outputBundlePath: string;
    metadata?: MetaDataOptions;
}

export interface PathData {
    pathToFile: string;
    resolvedPathToFile: string;
    filename: string;
    fileBaseName: string;
    fileExtension: string;
    outputDir: string;
    outputPath: string;
    outputFormat: string;
    outputBundlePath: string;
}

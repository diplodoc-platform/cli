import type {DocAnalytics} from '@diplodoc/client';

import {Logger} from '@diplodoc/transform/lib/log';
import {ChangelogItem} from '@diplodoc/transform/lib/plugins/changelog/types';
import {LintConfig} from '@diplodoc/transform/lib/yfmlint';

import {IncludeMode, Lang, ResourceType, Stage} from './constants';
import {FileContributors, VCSConnector, VCSConnectorConfig} from './vcs-connector/connector-models';

export type VarsPreset = string;

export type VarsMetadata = {
    [field: string]: string;
}[];

export type YfmPreset = Record<string, string> & {
    __metadata?: VarsMetadata;
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Metadata = Record<string, any>;

export type ExternalAuthorByPathFunction = (path: string) => Contributor | null;
export type ContributorsByPathFunction = (path: string) => Promise<FileContributors>;
export type NestedContributorsForPathFunction = (
    path: string,
    nestedContributors: Contributors,
) => void;
export type UserByLoginFunction = (login: string) => Promise<Contributor | null>;
export type GetModifiedTimeByPathFunction = (filepath: string) => number | undefined;

/**
 * VCS integration configuration object.
 * Future VCS futures should be configured with this one, not with
 * `VCSConnectorConfig`.
 */
interface VCSConfiguration {
    /**
     * Externally accessible base URI for a resource where a particular documentation
     * source is hosted.
     *
     * This configuration parameter is used to directly control the Edit button behaviour
     * in the Diplodoc documentation viewer(s).
     *
     * For example, if the following applies:
     * - Repo with doc source is hosted on GitHub (say, https://github.com/foo-org/bar),
     * - Within that particular repo, the directory that is being passed as an `--input`
     *   parameter to the CLI is located at `docs/`,
     * - Whenever the Edit button is pressed, you wish to direct your readers to the
     *   respective document's source on `main` branch
     *
     * you should pass `https://github.com/foo-org/bar/tree/main/docs` as a value for this parameter.
     */
    remoteBase?: string;
}

interface YfmConfig {
    varsPreset: VarsPreset;
    ignore: string[];
    outputFormat: string;
    allowHTML: boolean;
    vars: Record<string, string>;
    applyPresets: boolean;
    resolveConditions: boolean;
    conditionsInCode: boolean;
    disableLiquid: boolean;
    strict: boolean;
    ignoreStage: string;
    singlePage: boolean;
    included: boolean;
    removeHiddenTocItems: boolean;
    vcs?: VCSConfiguration;
    connector?: VCSConnectorConfig;
    lang?: `${Lang}`;
    langs?: `${Lang}`[];
    lintDisabled: boolean;
    lintConfig: LintConfig;
    resources?: Resources;
    needToSanitizeHtml: boolean;
    /**
     * false -> not extract changelogs after build md2md
     * true -> extract changelogs
     * <URL> -> extract and push to s3
     */
    changelogs: string | boolean;
    analytics?: DocAnalytics;
    useLegacyConditions?: boolean;
    search: {
        enabled: boolean;
        provider?: string;
    } & {[prop: string]: unknown};
}

export interface YfmArgv extends YfmConfig {
    rootInput: string;
    input: string;
    output: string;
    quiet: boolean;
    contributors: boolean;
    ignoreAuthorPatterns: string[];
    addSystemMeta: boolean;
    addMapFile: boolean;
    allowCustomResources: boolean;
    staticContent: boolean;
}

export type DocPreset = {
    default: YfmPreset;
    [varsPreset: string]: YfmPreset;
};

export interface YfmTocLabel extends Filter {
    title: string;
    description?: string;
    theme?: string;
}

export interface YfmToc extends Filter {
    name: string;
    href: string;
    items: YfmToc[];
    stage?: Stage;
    base?: string;
    title?: TextItems;
    include?: YfmTocInclude;
    id?: string;
    singlePage?: boolean;
    hidden?: boolean;
    label?: YfmTocLabel[] | YfmTocLabel;
}

export interface YfmTocInclude {
    repo: string;
    path: string;
    mode?: IncludeMode;
    includers?: YfmTocIncluders;
}

export type YfmTocIncluders = YfmTocIncluder[];

export type YfmTocIncluder = {
    name: string;
    // arbitrary includer parameters
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
} & Record<string, unknown>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Includer<FnParams = any> = {
    name: string;
    includerFunction: IncluderFunction<FnParams>;
};

export type IncluderFunction<PassedParams> = (
    args: IncluderFunctionParams<PassedParams>,
) => Promise<void>;

export type IncluderFunctionParams<PassedParams> = {
    // item that contains include that uses includer
    item: YfmToc;
    // base read directory path
    readBasePath: string;
    // base write directory path
    writeBasePath: string;
    // toc with includer path
    tocPath: string;
    vars: YfmPreset;
    // arbitrary includer parameters
    passedParams: PassedParams;
    index: number;
};

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

export interface MetaDataOptions {
    pathData: PathData;
    isContributorsEnabled?: boolean;
    vcsConnector?: VCSConnector;
    addSystemMeta?: boolean;
    resources?: Resources;
    shouldAlwaysAddVCSPath?: boolean;
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
    changelogs?: ChangelogItem[];
    extractChangelogs?: boolean;
    included?: boolean;
}

export interface Plugin {
    collect: (input: string, options: PluginOptions) => string | void;
}

export interface ResolveMd2MdOptions {
    inputPath: string;
    outputPath: string;
    metadata: MetaDataOptions;
}

export interface ResolverOptions {
    inputPath: string;
    filename: string;
    fileExtension: string;
    outputPath: string;
    outputBundlePath: string;
    lang: string;
    metadata?: MetaDataOptions;
}

export interface PathData {
    pathToFile: string;
    resolvedPathToFile: AbsolutePath;
    filename: string;
    fileBaseName: string;
    fileExtension: string;
    outputDir: AbsolutePath;
    outputPath: AbsolutePath;
    outputFormat: string;
    outputBundlePath: string;
    inputFolderPath: string;
    outputFolderPath: string;
}

export type Resources = {
    [key in Exclude<ResourceType, 'csp'>]?: string[];
} & {
    csp?: Record<string, string[]>[];
};

export type YandexCloudTranslateGlossaryPair = {
    sourceText: string;
    translatedText: string;
};

export type CommitInfo = {
    email: string;
    hashCommit: string;
};

import type {DocAnalytics} from '@diplodoc/client';
import type {BaseArgs as ProgramArgs, BaseConfig as ProgramConfig} from '~/core/program';
import type {Config} from '~/core/config';
import type {TemplatingArgs, TemplatingConfig, TemplatingRawConfig} from './features/templating';
import type {ContributorsArgs, ContributorsConfig} from './features/contributors';
import type {SinglePageArgs, SinglePageConfig} from './features/singlepage';
import type {LintArgs, LintConfig, LintRawConfig} from './features/linter';
import type {BuildManifestConfig} from './features/build-manifest';
import type {OutputMdArgs, OutputMdConfig} from './features/output-md';
import type {ChangelogsArgs, ChangelogsConfig} from './features/changelogs';
import type {SearchArgs, SearchConfig, SearchRawConfig} from './features/search';
import type {LegacyArgs, LegacyConfig, LegacyRawConfig} from './features/legacy';
import type {CustomResourcesArgs, CustomResourcesConfig} from './features/custom-resources';
import type {OutputFormat} from './config';
import type {PageData} from './services/entry';

export type {SearchProvider, SearchServiceConfig} from './services/search';
export type {EntryData, PageData} from './services/entry';

export {OutputFormat};

type BaseArgs = {output: AbsolutePath};

type BaseConfig = {
    lang: string;
    // TODO(patch): exetend langs list by newly supported langs or change type to string
    langs: string[];
    outputFormat: `${OutputFormat}`;
    varsPreset: string;
    vars: Hash;
    allowHtml: boolean;
    sanitizeHtml: boolean;
    ignoreStage: string[];
    ignore: string[];
    addSystemMeta: boolean;
    // TODO(minor): we can generate this file all time
    addMapFile: boolean;
    // TODO(major): can this be solved by `when` prop in toc?
    removeHiddenTocItems: boolean;
    mergeIncludes: boolean;
    // TODO(major): use as default behavior
    staticContent: boolean;
    // TODO: explicitly handle
    analytics: DocAnalytics;
    supportGithubAnchors?: boolean;
};

export type VcsArgs = {
    vcs: boolean;
    vcsToken: string;
};

export type BuildArgs = ProgramArgs &
    BaseArgs &
    Partial<
        TemplatingArgs &
            ContributorsArgs &
            SinglePageArgs &
            LintArgs &
            OutputMdArgs &
            ChangelogsArgs &
            SearchArgs &
            LegacyArgs &
            CustomResourcesArgs &
            VcsArgs
    >;

export type BuildRawConfig = BaseArgs &
    ProgramConfig &
    BaseConfig &
    TemplatingRawConfig &
    ContributorsConfig &
    SinglePageConfig &
    LintRawConfig &
    OutputMdConfig &
    ChangelogsConfig &
    SearchRawConfig &
    LegacyRawConfig &
    CustomResourcesConfig;

export type BuildConfig = Config<
    BaseArgs &
        ProgramConfig &
        BaseConfig &
        TemplatingConfig &
        ContributorsConfig &
        SinglePageConfig &
        LintConfig &
        BuildManifestConfig &
        OutputMdConfig &
        ChangelogsConfig &
        SearchConfig &
        LegacyConfig &
        CustomResourcesConfig
>;

export type EntryInfo = Partial<PageData>;

export type PositionedEntryInfo = {
    position: number;
} & EntryInfo;

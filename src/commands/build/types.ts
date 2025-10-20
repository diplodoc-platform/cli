import type {DocAnalytics} from '@diplodoc/client';
import type {BaseArgs as ProgramArgs, BaseConfig as ProgramConfig} from '~/core/program';
import type {VarsService} from '~/core/vars';
import type {Config} from '~/core/config';
import type {TemplatingArgs, TemplatingConfig, TemplatingRawConfig} from './features/templating';
import type {ContributorsArgs, ContributorsConfig} from './features/contributors';
import type {SinglePageArgs, SinglePageConfig} from './features/singlepage';
import type {PdfPageArgs} from './features/pdf-page';
import type {SkipHtmlArgs, SkipHtmlConfig} from './features/skip-html';
import type {LintArgs, LintConfig, LintRawConfig} from './features/linter';
import type {OutputMdArgs, OutputMdConfig, PreprocessConfig} from './features/output-md';
import type {BuildManifestArgs, BuildManifestConfig} from './features/build-manifest';
import type {ChangelogsArgs, ChangelogsConfig} from './features/changelogs';
import type {SearchArgs, SearchConfig, SearchRawConfig} from './features/search';
import type {LegacyArgs, LegacyConfig, LegacyRawConfig} from './features/legacy';
import type {CustomResourcesArgs, CustomResourcesConfig} from './features/custom-resources';
import type {TocFilteringArgs, TocFilteringConfig} from './features/toc-filtering';
import type {WatchArgs, WatchConfig} from './features/watch';
import type {OutputFormat} from './config';
import type {TransformConfig} from './run';
import type {
    EntryService,
    LeadingData,
    MarkdownData,
    NeuroExpert,
    PageData,
} from './services/entry';

export type {SearchProvider, SearchServiceConfig} from './services/search';
export type {EntryData, PageData} from './services/entry';

export {OutputFormat, TransformConfig};

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
    mergeIncludes: boolean;
    // TODO(major): use as default behavior
    staticContent: boolean;
    // TODO: explicitly handle
    analytics: DocAnalytics;
    supportGithubAnchors?: boolean;
    interface?: Hash;
    pdf: Record<string, boolean>;
    neuroExpert?: NeuroExpert;
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
            PdfPageArgs &
            SkipHtmlArgs &
            LintArgs &
            BuildManifestArgs &
            OutputMdArgs &
            ChangelogsArgs &
            SearchArgs &
            LegacyArgs &
            CustomResourcesArgs &
            TocFilteringArgs &
            VcsArgs &
            WatchArgs
    >;

export type BuildRawConfig = BaseArgs &
    ProgramConfig &
    BaseConfig &
    TemplatingRawConfig &
    ContributorsConfig &
    SinglePageConfig &
    SkipHtmlConfig &
    LintRawConfig &
    OutputMdConfig &
    ChangelogsConfig &
    SearchRawConfig &
    LegacyRawConfig &
    CustomResourcesConfig &
    TocFilteringConfig &
    PreprocessConfig &
    WatchConfig;

export type BuildConfig = Config<
    BaseArgs &
        ProgramConfig &
        BaseConfig &
        TemplatingConfig &
        ContributorsConfig &
        SinglePageConfig &
        SkipHtmlConfig &
        LintConfig &
        BuildManifestConfig &
        OutputMdConfig &
        ChangelogsConfig &
        SearchConfig &
        LegacyConfig &
        CustomResourcesConfig &
        TocFilteringConfig &
        PreprocessConfig &
        WatchConfig
>;

export type EntryInfo<Extras extends LeadingData | MarkdownData = LeadingData | MarkdownData> =
    PageData<Extras> & {
        entryGraph: EntryService['relations'];
        varsGraph: VarsService['relations'];
    };

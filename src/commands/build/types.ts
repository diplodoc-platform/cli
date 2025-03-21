import type {DocAnalytics} from '@diplodoc/client';
import type {BaseArgs as ProgramArgs, BaseConfig as ProgramConfig} from '~/core/program';
import type {Config} from '~/core/config';
import type {LeadingPage} from '~/core/leading';
import type {Meta} from '~/core/meta';
import type {TemplatingArgs, TemplatingConfig, TemplatingRawConfig} from './features/templating';
import type {ContributorsArgs, ContributorsConfig} from './features/contributors';
import type {SinglePageArgs, SinglePageConfig} from './features/singlepage';
import type {LintArgs, LintConfig, LintRawConfig} from './features/linter';
import type {ChangelogsArgs, ChangelogsConfig} from './features/changelogs';
import type {SearchArgs, SearchConfig, SearchRawConfig} from './features/search';
import type {LegacyArgs, LegacyConfig, LegacyRawConfig} from './features/legacy';
import type {CustomResourcesArgs, CustomResourcesConfig} from './features/custom-resources';
import type {OutputFormat} from './config';

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

export type BuildArgs = ProgramArgs &
    BaseArgs &
    Partial<
        TemplatingArgs &
            ContributorsArgs &
            SinglePageArgs &
            LintArgs &
            ChangelogsArgs &
            SearchArgs &
            LegacyArgs &
            CustomResourcesArgs
    >;

export type BuildRawConfig = BaseArgs &
    ProgramConfig &
    BaseConfig &
    TemplatingRawConfig &
    ContributorsConfig &
    SinglePageConfig &
    LintRawConfig &
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
        ChangelogsConfig &
        SearchConfig &
        LegacyConfig &
        CustomResourcesConfig
>;

export type EntryInfo = {
    lang: string;
    html?: string;
    data?: LeadingPage;
    meta: Meta;
    title: string;
    headings?: any;
};

import type {DocAnalytics} from '@diplodoc/client';
import type {BaseArgs as ProgramArgs, BaseConfig as ProgramConfig} from '~/core/program';
import type {Resources} from '~/core/meta';
import type {Config} from '~/core/config';
import type {TemplatingArgs, TemplatingConfig, TemplatingRawConfig} from './features/templating';
import type {ContributorsArgs, ContributorsConfig} from './features/contributors';
import type {SinglePageArgs, SinglePageConfig} from './features/singlepage';
import type {LintArgs, LintConfig, LintRawConfig} from './features/linter';
import type {ChangelogsArgs, ChangelogsConfig} from './features/changelogs';
import type {ThemerArgs, ThemerConfig} from './features/themer';
import type {SearchArgs, SearchConfig, SearchRawConfig} from './features/search';
import type {LegacyArgs, LegacyConfig, LegacyRawConfig} from './features/legacy';
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
    // TODO: move to isolated feature?
    allowCustomResources: boolean;
    resources: Resources;
    // TODO: explicitly handle
    analytics: DocAnalytics;
};

export type BuildArgs = ProgramArgs &
    BaseArgs &
    Partial<
        TemplatingArgs &
            ContributorsArgs &
            SinglePageArgs &
            LintArgs &
            ChangelogsArgs &
            ThemerArgs &
            SearchArgs &
            LegacyArgs
    >;

export type BuildRawConfig = BaseArgs &
    ProgramConfig &
    BaseConfig &
    TemplatingRawConfig &
    ContributorsConfig &
    SinglePageConfig &
    LintRawConfig &
    ChangelogsConfig &
    ThemerConfig &
    SearchRawConfig &
    LegacyRawConfig;

export type BuildConfig = Config<
    BaseArgs &
        ProgramConfig &
        BaseConfig &
        TemplatingConfig &
        ContributorsConfig &
        SinglePageConfig &
        LintConfig &
        ChangelogsConfig &
        ThemerConfig &
        SearchConfig &
        LegacyConfig
>;

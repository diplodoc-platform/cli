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
}

export interface DocPreset {
    default: YfmPreset;
    [varsPreset: string]: YfmPreset;
}

export interface YfmToc {
    name: string;
    href: string;
    items: YfmToc[];
    stage?: Stage;
    base?: string;
    title?: string;
    when?: boolean|string;
    include: YfmTocInclude;
    id?: string;
}

export interface YfmTocInclude {
    repo: string;
    path: string;
}

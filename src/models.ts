export type VarsPreset = 'internal'|'external';

export type YfmPreset = Record<string, string>;

export interface YfmConfig {
    varsPreset: VarsPreset;
    ignore: string[];
    outputFormat: string;
    allowHTML: string;
    vars: Record<string, string>;
    strict: boolean;
}

export interface YfmArgv extends YfmConfig {
    input: string;
    output: string;
}

export interface DocPreset {
    default: YfmPreset;
    [varsPreset: string]: YfmPreset;
}

export interface YfmToc {
    name: string;
    href: string;
    items: YfmToc[];
    base?: string;
    title?: string;
    when?: boolean|string;
    include: YfmTocInclude;
}

export interface YfmTocInclude {
    repo: string;
    path: string;
}

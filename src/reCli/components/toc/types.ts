import {YfmToc} from '~/models';

export interface TocIndex {
    toc: YfmToc;
    copyMap: Map<string, string>;
}

export type TocIndexMap = Map<string, TocIndex>;

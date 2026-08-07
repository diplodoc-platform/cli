import type {Meta} from './types';

export function getPublicMeta(meta: Meta): Meta {
    if (!meta.tags) {
        return meta;
    }

    const tags = meta.tags.filter((tag) => !tag.startsWith('_'));
    const {tags: _technicalTags, ...rest} = meta;

    return tags.length ? {...rest, tags} : rest;
}

export function getPublicState<TData extends {meta: Meta}, TState extends {data: TData}>(
    state: TState,
): TState {
    return {
        ...state,
        data: {
            ...state.data,
            meta: getPublicMeta(state.data.meta),
        },
    };
}

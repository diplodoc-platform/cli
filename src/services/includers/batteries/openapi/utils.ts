import {Endpoint, OpenApiIncluderParams, Specification, Tag} from './types';
import {YfmPreset} from '../../../../models';
import {evalExp} from '@doc-tools/transform/lib/liquid/evaluation';

type MatchActions = {
    endpoint?: (endpoint: Endpoint, tag?: Tag) => void;
    tag?: (tag: Tag) => void;
};

export function matchFilter(
    filter: OpenApiIncluderParams['filter'],
    vars: YfmPreset,
    actions: MatchActions,
    defaultMatch = true,
) {
    const {endpoint: endpointExpr, tag: tagExpr} = filter || {};
    const {endpoint: endpointAction = () => {}, tag: tagAction = () => {}} = actions || {};
    const matchTag = (tag: Tag) => (
        tagExpr
            ? evalExp(tagExpr, {...tag, vars})
            : defaultMatch
    );
    const matchEndpoint = (endpoint: Endpoint) => (
        endpointExpr
            ? evalExp(endpointExpr, {...endpoint, vars})
            : defaultMatch
    );

    return (spec: Specification): void => {
        const {tags, endpoints} = spec;

        for (const endpoint of endpoints) {
            if (matchEndpoint(endpoint)) {
                endpointAction(endpoint);
            }
        }

        for (const [, tag] of tags) {
            if (matchTag(tag)) {
                // eslint-disable-next-line no-shadow
                const {endpoints} = tag;

                for (const endpoint of endpoints) {
                    if (matchEndpoint(endpoint)) {
                        endpointAction(endpoint, tag);
                    }
                }

                tagAction(tag);
            }
        }
    };
}

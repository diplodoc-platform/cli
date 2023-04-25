/* eslint-disable-next-line no-shadow */
import {page, block, title, body, link, list} from './common';
import {ENDPOINTS_SECTION_NAME} from '../constants';

import {Tag, Endpoint, Endpoints} from '../types';

function section(tag: Tag) {
    const sectionPage = [
        title(1)(tag.name),
        description(tag.description),
        endpoints(tag.endpoints),
    ];

    return page(block(sectionPage));
}

function description(text?: string) {
    return text?.length && body(text);
}

function endpoints(data?: Endpoints) {
    const visibleEndpoints = data?.filter((ep) => !ep.hidden);
    const linkMap = ({id, summary}: Endpoint) => link(summary ?? id, id + '.md');

    return visibleEndpoints?.length && block([title(2)(ENDPOINTS_SECTION_NAME), list(visibleEndpoints.map(linkMap))]);
}

export {section};

export default {section};

/* eslint-disable-next-line no-shadow */
import {page, block, title, body, link, list} from './common';
import {DESCRIPTION_SECTION_NAME, ENDPOINTS_SECTION_NAME} from '../constants';

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
    return text?.length && block([title(2)(DESCRIPTION_SECTION_NAME), body(text)]);
}

function endpoints(data?: Endpoints) {
    const linkMap = ({id, summary}: Endpoint) => link(summary ?? id, id + '.md');

    return data?.length && block([title(2)(ENDPOINTS_SECTION_NAME), list(data.map(linkMap))]);
}

export {section};

export default {section};

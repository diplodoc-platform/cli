import {block, title, body, link, list} from './common';
import {DESCRIPTION_SECTION_NAME, ENDPOINTS_SECTION_NAME} from '../constants';

import {Tag, Endpoint, Endpoints} from '../types';

function section(tag: Tag) {
    const page = [
        title(1)(tag.name),
        description(tag.description),
        endpoints(tag.endpoints),
    ];

    return block(page);
}

function description(text?: string) {
    return text?.length && block([title(2)(DESCRIPTION_SECTION_NAME), body(text)]);
}

function endpoints(data?: Endpoints) {
    const links = (endpoints: Endpoints) =>
        endpoints.map(({id, summary}: Endpoint) => link(summary ?? id, id + '.md'));

    return data?.length && block([title(2)(ENDPOINTS_SECTION_NAME), list(links(data))]);
}

export {section};

export default {section};

import {sep} from 'path';

import {block, title, body, mono, link, list} from './common';
import {
    DESCRIPTION_SECTION_NAME,
    CONTACTS_SECTION_NAME,
    TAGS_SECTION_NAME,
} from '../constants';

import {Info, Contact, ContactSource, Tag, Specification} from '../types';
import {mdPath, sectionName} from '../index';

function main(info: Info, spec: Specification) {
    const license = info.license?.url ? link : body;

    const page = [
        title(1)(info.name),
        info.version?.length && body(mono(`version: ${info.version}`)),
        info.terms?.length && link('Terms of service', info.terms),
        info.license && license(info.license.name, info.license.url as string),
        description(info.description),
        contact(info.contact),
        sections(spec),
    ];

    return block(page);
}

function contact(data?: Contact) {
    return data?.name.length &&
           data?.sources.length &&
           block([
               title(2)(CONTACTS_SECTION_NAME),
               list(data.sources.map(contactSource(data))),
           ]);
}

function contactSource(data: Contact) {
    return (src: ContactSource) => link(data.name + ` ${src.type}`, src.url);
}

function description(text?: string) {
    return text?.length && block([title(2)(DESCRIPTION_SECTION_NAME), body(text)]);
}

function sections({tags, endpoints}: Specification) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any
    const links = Array.from(tags).map(([_, {name, id}]: [any, Tag]) => link(name, id + sep + 'index.md'));

    links.push(...endpoints.map((e) => link(sectionName(e), mdPath(e))));

    return links.length && block([title(2)(TAGS_SECTION_NAME), list(links)]);
}

export {main};

export default {main};

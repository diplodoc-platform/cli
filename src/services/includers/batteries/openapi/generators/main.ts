import {sep} from 'path';

import stringify from 'json-stringify-safe';

import {page, block, title, body, mono, link, list, cut, code} from './common';
import {
    CONTACTS_SECTION_NAME,
    TAGS_SECTION_NAME,
    SPEC_RENDER_MODE_DEFAULT,
    SPEC_SECTION_NAME,
    SPEC_SECTION_TYPE,
} from '../constants';

import {Info, Contact, ContactSource, Tag, Specification, LeadingPageSpecRenderMode} from '../types';
import {mdPath, sectionName} from '../index';

export type mainParams = {
    data: any;
    info: Info;
    spec: Specification;
    leadingPageSpecRenderMode: LeadingPageSpecRenderMode;
};

function main(params: mainParams) {
    const {data, info, spec, leadingPageSpecRenderMode} = params;

    const license = info.license?.url ? link : body;

    const mainPage = [
        title(1)(info.name),
        info.version?.length && body(mono(`version: ${info.version}`)),
        info.terms?.length && link('Terms of service', info.terms),
        info.license && license(info.license.name, info.license.url as string),
        description(info.description),
        contact(info.contact),
        sections(spec),
        specification(data, leadingPageSpecRenderMode),
    ];

    return page(block(mainPage));
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
    return text?.length && body(text);
}

function sections({tags, endpoints}: Specification) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any
    const links = Array.from(tags).map(([_, {name, id}]: [any, Tag]) => link(name, id + sep + 'index.md'));

    links.push(...endpoints.map((e) => link(sectionName(e), mdPath(e))));

    return links.length && block([title(2)(TAGS_SECTION_NAME), list(links)]);
}

function specification(data: any, renderMode: LeadingPageSpecRenderMode) {
    return renderMode === SPEC_RENDER_MODE_DEFAULT &&
        block([title(2)(SPEC_SECTION_NAME), cut(code(stringify(data, null, 4)), SPEC_SECTION_TYPE)]);
}

export {main};

export default {main};

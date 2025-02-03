import type {Run} from '~/commands/build';

import {load} from 'js-yaml';
import {dirname, join} from 'node:path';
import {LINK_KEYS} from '@diplodoc/client/ssr';

import {isExternalHref, own} from '~/core/utils';
import {checkPathExists, findAllValuesByKeys} from '~/utils';

const isMediaLink = (link: string) => /\.(svg|png|gif|jpe?g|bmp|webp|ico)$/.test(link);

/*
 * Processes assets files (everything except .md files)
 */
export async function processAssets(run: Run) {
    switch (run.config.outputFormat) {
        case 'md':
            return processAssetsMdRun(run);
    }
}

async function processAssetsMdRun(run: Run) {
    const {allowCustomResources, resources} = run.config;

    if (resources && allowCustomResources) {
        for (const file of [...(resources.script || []), ...(resources.style || [])]) {
            await run.copy(join(run.input, file), join(run.output, file));
        }
    }

    const yamlFiles = run.toc.entries.filter((file) => file.endsWith('.yaml'));
    const mediaLinks = new Set<RelativePath>();
    for (const yamlFile of yamlFiles) {
        const content = load(await run.read(join(run.input, yamlFile)));

        if (!own(content, 'blocks')) {
            return;
        }

        const contentLinks = findAllValuesByKeys(content, LINK_KEYS);
        for (const link of contentLinks) {
            if (
                isMediaLink(link) &&
                !isExternalHref(link) &&
                checkPathExists(link, join(run.input, yamlFile))
            ) {
                mediaLinks.add(join(dirname(yamlFile), link));
            }
        }
    }

    for (const link of mediaLinks) {
        await run.copy(join(run.input, link), join(run.output, link));
    }
}

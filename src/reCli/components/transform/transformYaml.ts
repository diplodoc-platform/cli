import {BuildConfig, Run} from '~/commands/build';
import {LeadingPage} from '~/models';
import {PresetIndex} from '~/reCli/components/presets/types';
import {getFilePresets} from '~/reCli/components/presets';
import {filterFiles, filterTextItems, firstFilterTextItems} from '~/services/utils';
import {liquidField, liquidFields} from '~/reCli/components/toc/utils';

interface TransformYamlProps {
    run: Run;
    options: BuildConfig;
    presetIndex: PresetIndex;
}

export function transformYaml(
    origYamlPage: LeadingPage,
    props: TransformYamlProps,
    pagePath: string,
) {
    const {presetIndex, options, run} = props;
    const {vars} = options;
    const yamlPage = origYamlPage;
    const {legacyConfig} = run;

    const combinedVars = getFilePresets(presetIndex, vars, pagePath);

    const title = firstFilterTextItems(yamlPage.title, combinedVars as Record<string, string>, {
        resolveConditions: true,
    });
    yamlPage.title = liquidField(title, combinedVars, pagePath, legacyConfig);

    const description = filterTextItems(
        yamlPage.description,
        combinedVars as Record<string, string>,
        {
            resolveConditions: true,
        },
    );
    yamlPage.description = liquidFields(description, combinedVars, pagePath, legacyConfig);

    if (yamlPage.meta?.title) {
        const metaTitle = firstFilterTextItems(
            yamlPage.meta.title,
            combinedVars as Record<string, string>,
            {
                resolveConditions: true,
            },
        );
        yamlPage.meta.title = liquidField(metaTitle, combinedVars, pagePath, legacyConfig);
    }

    if (yamlPage.meta?.description) {
        const metaDescription = firstFilterTextItems(
            yamlPage.meta.description,
            combinedVars as Record<string, string>,
            {
                resolveConditions: true,
            },
        );
        yamlPage.meta.description = liquidField(
            metaDescription,
            combinedVars,
            pagePath,
            legacyConfig,
        );
    }

    if (yamlPage.nav) {
        const navTitle = firstFilterTextItems(
            yamlPage.nav.title,
            combinedVars as Record<string, string>,
            {
                resolveConditions: true,
            },
        );
        yamlPage.nav.title = liquidField(navTitle, combinedVars, pagePath, legacyConfig);
    }

    yamlPage.links = filterFiles(yamlPage.links, 'links', combinedVars as Record<string, string>, {
        resolveConditions: true,
    });

    yamlPage.links.forEach((origLink) => {
        const link = origLink;
        if (link.title) {
            link.title = liquidField(link.title, combinedVars, pagePath, legacyConfig);
        }
        if (link.description) {
            link.description = liquidField(link.description, combinedVars, pagePath, legacyConfig);
        }
    });

    return yamlPage;
}

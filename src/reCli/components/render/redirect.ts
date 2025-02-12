import {Lang} from '~/constants';
import {join} from 'node:path';
import {generateStaticRedirect} from '~/pages';
import {BuildConfig} from '~/commands/build';
import {fileExists} from '~/reCli/utils';
import fs from 'node:fs';

export async function saveRedirectPage(outputDir: string, options: BuildConfig) {
    const {lang, langs} = options;

    const redirectLang = lang || langs?.[0] || Lang.RU;
    const redirectLangRelativePath = `./${redirectLang}/index.html`;

    const redirectPagePath = join(outputDir, 'index.html');
    const redirectLangPath = join(outputDir, redirectLangRelativePath);

    const [hasRedirectPage, hasRedirectLang] = await Promise.all([
        fileExists(redirectPagePath),
        fileExists(redirectLangPath),
    ]);

    if (!hasRedirectPage && hasRedirectLang) {
        const content = generateStaticRedirect(redirectLang, redirectLangRelativePath);
        await fs.promises.writeFile(redirectPagePath, content);
    }
}

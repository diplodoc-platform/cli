import type {Build, Run} from '~/commands/build';
import type {Command} from '~/core/config';
import type {LeadingPage, Plugin as LeadingPlugin} from '~/core/leading';

import {join} from 'node:path';

import {getHooks as getBuildHooks} from '~/commands/build';
import {getHooks as getBaseHooks} from '~/core/program';
import {getHooks as getLeadingHooks} from '~/core/leading';
import {getHooks as getMarkdownHooks} from '~/core/markdown';
import {getHooks as getMetaHooks} from '~/core/meta';
import {copyJson} from '~/core/utils';
import {defined} from '~/core/config';

import {MarkdownOutputRenderer} from '../output-md/renderer';
import {SELF_CONTAINED} from '../output-md/collect';
import {buildCompanionAlternate, getCustomCollectPlugins} from '../output-md/utils';

import {options} from './config';

export type CompanionsArgs = {
    aiMdCompanions: boolean;
};

const NAME = 'Companions';

export class Companions {
    apply(program: Build) {
        getBaseHooks(program).Command.tap(NAME, (command: Command) => {
            command.addOption(options.aiMdCompanions);
        });

        getBaseHooks(program).Config.tap(NAME, (config, args) => {
            const value = defined('aiMdCompanions', args);
            config.ai.mdCompanions =
                value === null || value === undefined
                    ? Boolean(config.ai.mdCompanions)
                    : Boolean(value);

            return config;
        });

        getBuildHooks(program)
            .BeforeRun.for('html')
            .tap(NAME, (run) => this.configure(run));
    }

    private configure(run: Run) {
        if (!run.config.ai.mdCompanions) {
            return;
        }

        const renderer = new MarkdownOutputRenderer(run, {
            metaSource: 'snapshot',
            audience: 'human',
            collectConfig: {
                ...SELF_CONTAINED,
                ...run.config.preprocess,
                hashIncludes: false,
                mergeIncludes: true,
            },
        });
        const leadingSources = new Map<NormalizedPath, LeadingPage>();

        getMarkdownHooks(run.markdown).Collects.tap(NAME, (collects) => {
            return collects.concat(getCustomCollectPlugins());
        });

        // Capture a leading page after common YAML/template processing but before
        // the HTML-only Page Constructor plugin replaces embedded Markdown with HTML.
        getLeadingHooks(run.leading).Plugins.tap(NAME, (plugins) => {
            return [createLeadingSourceCapture(leadingSources), ...plugins];
        });

        getMetaHooks(run.meta).Dump.tap(NAME, (meta, file) => {
            if (!run.toc.isEntry(file)) {
                return meta;
            }

            const alternate = buildCompanionAlternate(file, run.config.baseHref);
            const exists = meta.alternate?.some(
                (item) => item.href === alternate.href && item.type === alternate.type,
            );

            if (!exists) {
                meta.alternate = [...(meta.alternate || []), alternate];
            }

            return meta;
        });

        // This tap is registered before OutputHtml's Markdown tap. It renders a
        // separate copy, then leaves the original vfile untouched for md2html.
        getMarkdownHooks(run.markdown).Dump.tapPromise(NAME, async (vfile) => {
            if (!vfile.path.endsWith('.md')) {
                return;
            }

            const companion = vfile.copy();
            await renderer.renderMarkdown(companion);
            await run.write(join(run.output, companion.path), companion.toString(), true);
        });

        getLeadingHooks(run.leading).Dump.tapPromise(NAME, async (vfile) => {
            const source = leadingSources.get(vfile.path);
            if (!source) {
                throw new Error(`Unable to capture leading source for companion: ${vfile.path}`);
            }

            leadingSources.delete(vfile.path);

            const companion = vfile.copy();
            companion.data = source;
            await renderer.renderLeading(companion);
            await run.write(join(run.output, companion.path), companion.toString(), true);
        });
    }
}

function createLeadingSourceCapture(sources: Map<NormalizedPath, LeadingPage>): LeadingPlugin {
    return function captureLeadingSource(leading) {
        sources.set(this.path, copyJson(leading));
        return leading;
    };
}

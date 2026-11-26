const assert = require('node:assert/strict');
const {appendFileSync, realpathSync} = require('node:fs');
const {createRequire} = require('node:module');
const {resolve} = require('node:path');

const binary = process.env.DIPLODOC_BINARY_PATH;
const requireFromCli = binary ? createRequire(realpathSync(resolve(binary))) : require;
const {definePlugin} = requireFromCli('@diplodoc/transform/configuration');
const {getHooks: programHooks} = requireFromCli('@diplodoc/cli/lib/program');
const {getHooks: markdownHooks} = requireFromCli('@diplodoc/cli/lib/markdown');

function record(event) {
    appendFileSync(process.env.API4_REPORT, JSON.stringify(event) + '\n');
}

function collect(content) {
    record({phase: 'collect', path: this.path, options: Object.keys(arguments[1])});
    return content.replaceAll('API4_SOURCE', 'API4_COLLECTED');
}

const badge = definePlugin({
    id: 'fixture/badge',
    collect,
    setup(md, options, context) {
        assert.equal(options.path, 'plugin-only-path');
        assert.equal(options.label, 'Configured badge');
        assert.notEqual(context.path, options.path);
        assert.equal(typeof context.log.info, 'function');
        assert.equal(typeof context.lang, 'string');
        assert.equal('label' in context, false);
        record({phase: 'setup', path: context.path, label: options.label, lang: context.lang});
        md.core.ruler.after('inline', 'api4_badge', (state) => {
            for (const token of state.tokens) {
                for (const child of token.children || []) {
                    if (child.type === 'text') {
                        child.content = child.content.replaceAll('API4_BADGE', options.label);
                    }
                }
            }
        });
    },
});

exports.Extension = class Extension {
    apply(program) {
        programHooks(program).BeforeAnyRun.tap('Api4Fixture', (run) => {
            if (!run.markdown) return;
            const configured = badge({label: 'Configured badge', path: 'plugin-only-path'});
            assert.equal(configured.plugin.collect, collect);
            markdownHooks(run.markdown).Plugins.tap('Api4Fixture', (plugins) =>
                plugins.concat(configured.plugin));
            markdownHooks(run.markdown).Collects.tap('Api4Fixture', (collectors) => {
                assert.equal(configured.plugin.collect, collect);
                return collectors.concat(configured.plugin.collect);
            });
        });
    }
};

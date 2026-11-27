import assert from 'node:assert/strict';
import {copyFileSync, mkdtempSync, readFileSync, readdirSync, rmSync} from 'node:fs';
import {createRequire} from 'node:module';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

/** Verify the built or extracted private parser against its exact upstream distribution. */
export async function verifyMarkdownItPackage(packageRoot, projectRoot) {
    const packageRequire = createRequire(join(packageRoot, 'package.json'));
    const referenceRequire = createRequire(join(projectRoot, 'package.json'));
    const Optimized = packageRequire('./lib/markdown/markdown-it-runtime.cjs');
    const Reference = referenceRequire('markdown-it');
    assert.equal(typeof Optimized, 'function');
    assert.match(Optimized.Token.toString(), /content = ""/);
    assert.doesNotMatch(Optimized.Token.toString(), /_defineProperty/);

    const notices = readFileSync(
        join(packageRoot, 'lib/markdown/markdown-it-runtime.LICENSES.txt'),
        'utf8',
    );
    const aliasManifest = referenceRequire.resolve('markdown-it/package.json');
    const aliasRequire = createRequire(aliasManifest);
    const dependencies = [['markdown-it', dirname(aliasManifest)]];
    for (const name of ['entities', 'linkify-it', 'mdurl', 'punycode.js', 'uc.micro']) {
        let directory = dirname(aliasRequire.resolve(name));
        while (!readdirSync(directory).includes('package.json')) directory = dirname(directory);
        dependencies.push([name, directory]);
    }
    for (const [name, directory] of dependencies) {
        const manifest = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'));
        assert.equal(manifest.name, name);
        if (name === 'linkify-it') assert.match(manifest.version, /^6\./);
        assert.ok(notices.includes(`${name}@${manifest.version}\n`));
        const licenses = readdirSync(directory).filter((file) =>
            /^(?:licen[sc]e|copying|notice)(?:[._-].*)?$/i.test(file),
        );
        assert.ok(licenses.length, `Expected full license files for ${name}`);
        for (const license of licenses) {
            assert.ok(notices.includes(readFileSync(join(directory, license), 'utf8').trim()));
        }
    }

    const sources = [
        '',
        '# Heading\n\nA *paragraph* with [a link](https://example.org).',
        '[label]: /target "Title"\n\n[link][label]\n\n![image](/image.png)',
        '> quote\n>\n> - first\n> - second\n\n    code\n\n```js\nx()\n```',
        '| first | second |\n| :--- | ---: |\n| one | `two` |',
        'https://user:pass@example.org/path\n\nuser@example.org\n\nwww.example.org',
        '<h1 title="quoted > <h1>fake</h1>">Real</h1>\n\n<!-- comment -->',
        Array.from({length: 8000}, () => 'A long paragraph line with *emphasis*.').join('\n'),
    ];
    const addFixtures = (directory) => {
        for (const entry of readdirSync(directory, {withFileTypes: true})) {
            if (entry.name.startsWith('output') || entry.name === 'node_modules') continue;
            const path = join(directory, entry.name);
            if (entry.isDirectory()) addFixtures(path);
            else if (entry.name.endsWith('.md')) sources.push(readFileSync(path, 'utf8'));
        }
    };
    addFixtures(join(projectRoot, 'tests/mocks'));
    const deflist = referenceRequire('markdown-it-deflist');
    const imsize = referenceRequire('@diplodoc/transform/plugins/imsize');
    const table = referenceRequire('@diplodoc/transform/plugins/table');
    const grammars = [
        {options: {}, loader: false},
        {options: {html: true, linkify: true, breaks: true}, loader: false},
        {options: {html: true}, loader: true},
    ];
    for (const {options, loader} of grammars) {
        const before = new Reference(options);
        const after = new Optimized(options);
        if (loader) {
            for (const parser of [before, after]) {
                parser.use(deflist);
                parser.use(imsize, {deprecationWarnings: false});
                parser.use(table, {deprecationWarnings: false});
            }
        }
        for (const source of sources) {
            const beforeEnv = {};
            const afterEnv = {};
            assert.equal(after.render(source, afterEnv), before.render(source, beforeEnv));
            assert.deepEqual(afterEnv, beforeEnv);
            assert.equal(
                JSON.stringify(after.parse(source, {})),
                JSON.stringify(before.parse(source, {})),
            );
        }
    }

    const descriptors = (Constructor) => {
        let setterCalls = 0;
        class Derived extends Constructor.Token {
            set content(value) {
                setterCalls++;
            }
        }
        const token = new Derived('text', '', 0);
        assert.equal(setterCalls, 0);
        return Object.getOwnPropertyDescriptors(token);
    };
    assert.deepEqual(descriptors(Optimized), descriptors(Reference));
    const cjs = readFileSync(join(packageRoot, 'lib/markdown/index.js'), 'utf8');
    const esm = readFileSync(join(packageRoot, 'lib/markdown/index.mjs'), 'utf8');
    assert.match(cjs, /require\("\.\/markdown-it-runtime\.cjs"\)/);
    assert.match(esm, /import MarkdownItConstructor from "\.\/markdown-it-runtime\.cjs"/);
    assert.doesNotMatch(cjs, /require\("markdown-it"\)/);
    assert.doesNotMatch(esm, /(?:from |__require\()"markdown-it"/);

    const standalone = mkdtempSync(join(tmpdir(), 'diplodoc-native-parser-'));
    try {
        const runtime = join(standalone, 'parser.cjs');
        copyFileSync(join(packageRoot, 'lib/markdown/markdown-it-runtime.cjs'), runtime);
        const isolatedRequire = createRequire(join(standalone, 'consumer.cjs'));
        const cjsParser = isolatedRequire('./parser.cjs');
        const esmParser = (await import(pathToFileURL(runtime).href)).default;
        assert.equal(cjsParser, esmParser);
        assert.equal(new esmParser().render('# Closed'), '<h1>Closed</h1>\n');
    } finally {
        rmSync(standalone, {recursive: true, force: true});
    }
    return {
        sources: sources.length,
        optionSets: grammars.length,
        tokenFieldSemantics: 'unchanged',
        closedCjsAndEsm: true,
    };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
    const packageRoot = resolve(process.argv[2] || projectRoot);
    console.log(JSON.stringify(await verifyMarkdownItPackage(packageRoot, projectRoot)));
}

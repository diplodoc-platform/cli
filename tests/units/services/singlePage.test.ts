import {parse} from 'node-html-parser';
import {join} from 'path';

import {
    convertSlashToWindowsBackSlashes,
} from 'utils/path';
import {
    tryFixFirstPageHeader,
    addPagePrefixToAnchors,
    decreaseHeadingLevels,
    replaceLinks,
    replaceImages,
    addMainTitle,
} from 'utils/singlePage';

describe('Adding the main title', () => {
    const options = {
        title: 'Title',
        root: __dirname,
        path: 'about.html',
        tocDir: '',
    };

    test('Should be just added', () => {
        const content = '<h2></h2>';
        const expected = '<h1>Title</h1><h2></h2>';

        const root = parse(content);
        addMainTitle(root, options);

        const result = root.toString();

        expect(result).toEqual(expected);
    });

    test('Should be added the page attributes', () => {
        const content = '<h1>Title</h1>';
        const expected =
            `<h1 data-original-article="${convertSlashToWindowsBackSlashes('/about.html')}">Title` +
            `<a class="yfm-anchor" aria-hidden="true" href="#_about" id="_about"></a></h1>`;

        const root = parse(content);

        addPagePrefixToAnchors(root, options);

        const result = root.toString();

        expect(result).toEqual(expected);
    });
});

describe('Try to fix the first page header', () => {
    test('Should be fixed', () => {
        const content = '<h2></h2><h2></h2>';
        const expected = '<h1></h1><h2></h2>';

        const root = parse(content);
        tryFixFirstPageHeader(root);
        const result = root.toString();

        expect(result).toEqual(expected);
    });

    test('Should be ignored if all is correct', () => {
        const content = '<h1></h1><h2></h2>';
        const expected = '<h1></h1><h2></h2>';

        const root = parse(content);
        tryFixFirstPageHeader(root);
        const result = root.toString();

        expect(result).toEqual(expected);
    });

    test('Should be ignored if there are no headers', () => {
        const content = '<div></div>';
        const expected = '<div></div>';

        const root = parse(content);
        tryFixFirstPageHeader(root);
        const result = root.toString();

        expect(result).toEqual(expected);
    });
});

describe('Add a page prefix to anchors', () => {
    test('Should be added', () => {
        const content = [
            '<h1 id="first-header">',
            '<a class="yfm-anchor" href="#first-header" id="first-header"></a>',
            '</h1>',
            '<h2 id="second-header">',
            '<a class="yfm-anchor" href="#second-header" id="second-header"></a>',
            '</h2>',
        ].join('\n');
        const expected = [
            `<h1 id="_index_first-header" data-original-article="${convertSlashToWindowsBackSlashes('/index.html')}">`,
            '<a class="yfm-anchor" href="#_index_first-header" id="_index_first-header"></a>',
            '<a class="yfm-anchor" aria-hidden="true" href="#_index" id="_index"></a></h1>',
            '<h2 id="_index_second-header">',
            '<a class="yfm-anchor" href="#_index_second-header" id="_index_second-header"></a>',
            '</h2>',
        ].join('\n');

        const root = parse(content);
        addPagePrefixToAnchors(root, {
            root: __dirname,
            path: 'index.html',
            tocDir: '',
        });
        const result = root.toString();

        expect(result).toEqual(expected);
    });
});

describe('Decrease heading levels', () => {
    test('Should work', () => {
        const content = '<h1></h1><h1></h1><h2></h2><h3></h3><h4></h4><h5></h5><h6></h6>';
        const expected = '<h2></h2><h2></h2><h3></h3><h4></h4><h5></h5><h6></h6><h6></h6>';

        const root = parse(content);
        decreaseHeadingLevels(root);
        const result = root.toString();

        expect(result).toEqual(expected);
    });
});

describe('Make links to pages as hashes to sections in a single page', () => {
    test('Should be replaced if file is root', () => {
        const content = [
            `<a href="${convertSlashToWindowsBackSlashes('folder/index.html')}"></a>`,
            `<a href="${convertSlashToWindowsBackSlashes('folder/index.html#third-header')}"></a>`,
            '<a href="index.html"></a>',
        ].join('\n');

        const expected = [
            '<a href="#_folder_index"></a>',
            '<a href="#_folder_index_third-header"></a>',
            '<a href="#_index"></a>',
        ].join('\n');

        const root = parse(content);
        replaceLinks(root, {
            root: __dirname,
            path: 'index.html',
            tocDir: __dirname,
        });
        const result = root.toString();

        expect(result).toEqual(expected);
    });

    test('Should be replaced if file is not root', () => {
        const content = [
            `<a href="${convertSlashToWindowsBackSlashes('../folder/index.html')}"></a>`,
            `<a href="${convertSlashToWindowsBackSlashes('../folder/index.html#third-header')}"></a>`,
            `<a href="${convertSlashToWindowsBackSlashes('../index.html')}"></a>`,
        ].join('\n');

        const expected = [
            '<a href="#_folder_index"></a>',
            '<a href="#_folder_index_third-header"></a>',
            '<a href="#_index"></a>',
        ].join('\n');

        const root = parse(content);
        replaceLinks(root, {
            root: __dirname,
            path: convertSlashToWindowsBackSlashes('folder1/index.html'),
            tocDir: __dirname,
        });
        const result = root.toString();

        expect(result).toEqual(expected);
    });

    test('External links should not be replaced', () => {
        const content = '<a href="https://ydocs.tech" target="_blank"></a>';

        const root = parse(content);
        replaceLinks(root, {
            root: __dirname,
            path: 'index.html',
            tocDir: __dirname,
        });
        const result = root.toString();

        expect(result).toEqual(content);
    });

    test('Should not be replaced as hash if a link is out of the root folder', () => {
        const content = `<a href="${convertSlashToWindowsBackSlashes('../../index.html')}"></a>`;
        const expected = `<a href="${convertSlashToWindowsBackSlashes('../index.html')}"></a>`;

        const root = parse(content);
        replaceLinks(root, {
            root: __dirname,
            path: convertSlashToWindowsBackSlashes('folder/index.html'),
            tocDir: __dirname,
        });
        const result = root.toString();

        expect(result).toEqual(expected);
    });

    test('Should not be replaced as hash if a link is out of the single page (but not out of the root)', () => {
        const content = `<a href="${convertSlashToWindowsBackSlashes('../../service2/index.html')}"></a>`;
        const expected = `<a href="${convertSlashToWindowsBackSlashes('../service2/index.html')}"></a>`;

        const root = parse(content);
        replaceLinks(root, {
            root: __dirname,
            path: convertSlashToWindowsBackSlashes('service1/folder/index.html'),
            tocDir: join(__dirname, 'service1'),
        });
        const result = root.toString();

        expect(result).toEqual(expected);
    });
});

describe('Make image sources relative from the single page file', () => {
    test('Image sources should not be replaced if file is root', () => {
        const content = [
            `<img src="${convertSlashToWindowsBackSlashes('_assets/index.png')}" alt="test">`,
            `<img src="${convertSlashToWindowsBackSlashes('../../_assets/index.png')}" alt="test">`,
        ].join('\n');

        const root = parse(content);
        replaceImages(root, {
            root: __dirname,
            path: 'index.html',
            tocDir: __dirname,
        });
        const result = root.toString();

        expect(result).toEqual(content);
    });

    test('Image sources should be replaced if the file is not root', () => {
        const content = [
            `<img src="${convertSlashToWindowsBackSlashes('_assets/index.png')}" alt="test">`,
            `<img src="${convertSlashToWindowsBackSlashes('../../_assets/index.png')}" alt="test">`,
        ].join('\n');
        const expected = [
            `<img src="${convertSlashToWindowsBackSlashes('folder/_assets/index.png')}" alt="test">`,
            `<img src="${convertSlashToWindowsBackSlashes('../_assets/index.png')}" alt="test">`,
        ].join('\n');

        const root = parse(content);
        replaceImages(root, {
            root: __dirname,
            path: convertSlashToWindowsBackSlashes('folder/index.html'),
            tocDir: __dirname,
        });
        const result = root.toString();

        expect(result).toEqual(expected);
    });

    test('External image sources should not be replaced', () => {
        const content = '<img src="https://ydocs.tech/favicon.png" alt="test">';

        const root = parse(content);
        replaceImages(root, {
            root: __dirname,
            path: 'index.html',
            tocDir: __dirname,
        });
        const result = root.toString();

        expect(result).toEqual(content);
    });
});

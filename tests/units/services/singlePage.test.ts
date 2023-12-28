import {parse} from 'node-html-parser';
import {join} from 'path';
import {platformless} from '../../utils';

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
        const root = parse(content);
        addMainTitle(root, options);
        expect(platformless(root.toString())).toMatchSnapshot();
    });

    test('Should be added the page attributes', () => {
        const content = '<h1>Title</h1>';
        const root = parse(content);
        addPagePrefixToAnchors(root, options);
        expect(platformless(root.toString())).toMatchSnapshot();
    });
});

describe('Try to fix the first page header', () => {
    test('Should be fixed', () => {
        const content = '<h2></h2><h2></h2>';
        const root = parse(content);
        tryFixFirstPageHeader(root);
        expect(platformless(root.toString())).toMatchSnapshot();
    });

    test('Should be ignored if all is correct', () => {
        const content = '<h1></h1><h2></h2>';
        const root = parse(content);
        tryFixFirstPageHeader(root);
        expect(platformless(root.toString())).toMatchSnapshot();
    });

    test('Should be ignored if there are no headers', () => {
        const content = '<div></div>';
        const root = parse(content);
        tryFixFirstPageHeader(root);
        expect(platformless(root.toString())).toMatchSnapshot();
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

        const root = parse(content);
        addPagePrefixToAnchors(root, {
            root: __dirname,
            path: 'index.html',
            tocDir: '',
        });
        expect(platformless(root.toString())).toMatchSnapshot();
    });
});

describe('Decrease heading levels', () => {
    test('Should work', () => {
        const content = '<h1></h1><h1></h1><h2></h2><h3></h3><h4></h4><h5></h5><h6></h6>';
        const root = parse(content);
        decreaseHeadingLevels(root);
        expect(platformless(root.toString())).toMatchSnapshot();
    });
});

describe('Make links to pages as hashes to sections in a single page', () => {
    test('Should be replaced if file is root', () => {
        const content = [
            `<a href="folder/index.html"></a>`,
            `<a href="folder/index.html#third-header"></a>`,
            '<a href="index.html"></a>',
        ].join('\n');
        const root = parse(content);
        replaceLinks(root, {
            root: __dirname,
            path: 'index.html',
            tocDir: __dirname,
        });
        expect(platformless(root.toString())).toMatchSnapshot();
    });

    test('Should be replaced if file is not root', () => {
        const content = [
            `<a href="../folder/index.html"></a>`,
            `<a href="../folder/index.html#third-header"></a>`,
            `<a href="../index.html"></a>`,
        ].join('\n');
        const root = parse(content);
        replaceLinks(root, {
            root: __dirname,
            path: 'folder1/index.html',
            tocDir: __dirname,
        });
        expect(platformless(root.toString())).toMatchSnapshot();
    });

    test('External links should not be replaced', () => {
        const content = '<a href="https://ydocs.tech" target="_blank"></a>';
        const root = parse(content);
        replaceLinks(root, {
            root: __dirname,
            path: 'index.html',
            tocDir: __dirname,
        });
        expect(platformless(root.toString())).toMatchSnapshot();
    });

    test('Should not be replaced as hash if a link is out of the root folder', () => {
        const content = `<a href="../../index.html"></a>`;
        const root = parse(content);
        replaceLinks(root, {
            root: __dirname,
            path: 'folder/index.html',
            tocDir: __dirname,
        });
        expect(platformless(root.toString())).toMatchSnapshot();
    });

    test('Should not be replaced as hash if a link is out of the single page (but not out of the root)', () => {
        const content = `<a href="../../service2/index.html"></a>`;
        const root = parse(content);
        replaceLinks(root, {
            root: __dirname,
            path: 'service1/folder/index.html',
            tocDir: join(__dirname, 'service1'),
        });
        expect(platformless(root.toString())).toMatchSnapshot();
    });
});

describe('Make image sources relative from the single page file', () => {
    test('Image sources should not be replaced if file is root', () => {
        const content = [
            `<img src="_assets/index.png" alt="test">`,
            `<img src="../../_assets/index.png" alt="test">`,
        ].join('\n');
        const root = parse(content);
        replaceImages(root, {
            root: __dirname,
            path: 'index.html',
            tocDir: __dirname,
        });
        expect(platformless(root.toString())).toMatchSnapshot();
    });

    test('Image sources should be replaced if the file is not root', () => {
        const content = [
            `<img src="_assets/index.png" alt="test">`,
            `<img src="../../_assets/index.png" alt="test">`,
        ].join('\n');
        const root = parse(content);
        replaceImages(root, {
            root: __dirname,
            path: 'folder/index.html',
            tocDir: __dirname,
        });
        const result = root.toString();
        expect(platformless(result)).toMatchSnapshot();
    });

    test('External image sources should not be replaced', () => {
        const content = '<img src="https://ydocs.tech/favicon.png" alt="test">';
        const root = parse(content);
        replaceImages(root, {
            root: __dirname,
            path: 'index.html',
            tocDir: __dirname,
        });
        expect(platformless(root.toString())).toMatchSnapshot();
    });
});

import {describe, expect, it} from 'vitest';

import {scanPage} from './markdown';

describe('translate eval markdown scanner', () => {
    it('should split prose and fences', () => {
        const page = ['# Title', '', '```bash', 'echo 1', '```', '', 'Tail.'].join('\n');

        const result = scanPage(page);

        expect(result.fences).toEqual([{info: 'bash', content: 'echo 1'}]);
        expect(result.prose.map((line) => line.text)).toEqual(['# Title', '', '', 'Tail.']);
        expect(result.prose.map((line) => line.line)).toEqual([1, 2, 6, 7]);
    });

    it('should close a fence only with a long enough marker run', () => {
        const page = ['````markdown', '```', 'inner', '```', '````'].join('\n');

        const result = scanPage(page);

        expect(result.fences).toEqual([{info: 'markdown', content: '```\ninner\n```'}]);
        expect(result.prose).toEqual([]);
    });

    it('should support tilde fences', () => {
        const page = ['~~~', 'body', '~~~'].join('\n');

        expect(scanPage(page).fences).toEqual([{info: '', content: 'body'}]);
    });

    it('should keep an unterminated fence', () => {
        const page = ['```js', 'const x = 1;'].join('\n');

        expect(scanPage(page).fences).toEqual([{info: 'js', content: 'const x = 1;'}]);
    });
});

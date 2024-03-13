import {filterByLang} from 'utils/filterByLang';
import {ArgvService} from 'services/index';
import {YfmArgv} from 'models';

describe('test filtering paths of toc files by lang', () => {
    afterEach(() => {
        ArgvService.set(undefined as YfmArgv);
    })

    it('should remove toc from not included lang', () => {
        ArgvService.set({
            langs: ['ru']
        } as YfmArgv);

        const tocFilePaths = [
            'ru/toc.yaml',
            'en/toc.yaml'
        ];
        const expected = [
            'ru/toc.yaml',
        ];
        expect(filterByLang(tocFilePaths)).toEqual(expected);
    });

    it('should remove tocs from not included lang and work with nested paths', () => {
        ArgvService.set({
            langs: ['ru', 'fr']
        } as YfmArgv);

        const tocFilePaths = [
            'ru/toc.yaml',
            'ru/xxx/yyy/toc.yaml',
            'en/toc.yaml',
            'en/aaa/bbb/toc.yaml',
            'fr/toc.yaml',
            'fr/111/222/toc.yaml'
        ];
        const expected = [
            'ru/toc.yaml',
            'ru/xxx/yyy/toc.yaml',
            'fr/toc.yaml',
            'fr/111/222/toc.yaml'
        ];
        expect(filterByLang(tocFilePaths)).toEqual(expected);
    });
});
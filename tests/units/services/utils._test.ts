import {filterTextItems, filterFiles, firstFilterTextItems, liquidField} from "services/utils";
import {Lang} from "../../../src/constants";
import {ArgvService} from "../../../src/services";
import {YfmArgv} from "models";
import {findAllValuesByKeys} from "utils";

const combinedVars = {
    lang: Lang.EN,
};

describe('filterTextItems', () => {
    test('string', () => {
        const description = 'test';

        const result = filterTextItems(
            description,
            combinedVars,
            {resolveConditions: true},
        );

        expect(result).toBe(description);
    });

    test('string[]', () => {
        const description = [
            'line1',
            'line2'
        ];

        const result = filterTextItems(
            description,
            combinedVars,
            {resolveConditions: true},
        );

        expect(result).toEqual(description);
    });

    test('filter[]', () => {
        const description = [{
            text: 'line1',
            when: `lang == "${Lang.EN}"`,
        }, {
            text: 'line2',
            when: `lang == "${Lang.RU}"`,
        }, {
            text: [
                'line3',
                'line4',
            ]
        }];

        const result = filterTextItems(
            description,
            combinedVars,
            {resolveConditions: true},
        );

        expect(result).toEqual(['line1', 'line3', 'line4']);
    });
});

describe('firstFilterTextItems', () => {
    test('string', () => {
        const title = 'line1';

        const result = firstFilterTextItems(
            title,
            combinedVars,
            {resolveConditions: true},
        );

        expect(result).toEqual('line1');
    });

    test('string[]', () => {
        const title = ['line1', 'line2'];

        const result = firstFilterTextItems(
            title,
            combinedVars,
            {resolveConditions: true},
        );

        expect(result).toEqual('line1');
    });

    test('TextItem[]', () => {
        const title = [{
            text: 'line1',
            when: `lang == "${Lang.EN}"`,
        }, {
            text: 'line2',
            when: `lang == "${Lang.RU}"`,
        }];

        const result = firstFilterTextItems(
            title,
            combinedVars,
            {resolveConditions: true},
        );

        expect(result).toEqual('line1');
    });
});

describe('filterFiles', () => {
    test('filter[]', () => {
        const links = [{
            title: 'line1',
            when: `lang == "${Lang.EN}"`,
        }, {
            title: 'line2',
            when: `lang == "${Lang.RU}"`,
        }, {
            title: [
                'line3',
                'line4',
            ]
        }];

        const result = filterFiles(links, 'links', combinedVars, {resolveConditions: true});

        expect(result).toEqual([{
            title: 'line1',
        }, {
            title: [
                'line3',
                'line4',
            ]
        }]);
    });
});

describe('liquidField', () => {
    afterEach(() => {
        ArgvService.set(undefined as YfmArgv);
    });

    test('substitution', () => {
        ArgvService.set({
            applyPresets: true,
            resolveConditions: false,
        } as YfmArgv);

        const vars = {test: 'test'};

        const result = liquidField('{{test}}', vars, '');

        expect(result).toBe(vars.test);
    });

    test('substitution not var', () => {
        ArgvService.set({
            applyPresets: true,
            resolveConditions: false,
        } as YfmArgv);

        const vars = {test: 'test'};

        const result = liquidField('not_var{{test}}', vars, '');

        expect(result).toBe('not_var{{test}}');
    });

    test('substitution disabled', () => {
        ArgvService.set({
            applyPresets: false,
            resolveConditions: false,
        } as YfmArgv);

        const vars = {test: 'test'};

        const result = liquidField('{{test}}', vars, '');

        expect(result).toBe('{{test}}');
    });

    test('condition', () => {
        ArgvService.set({
            applyPresets: false,
            resolveConditions: true
        } as YfmArgv);

        const vars = {type: 'a'};

        const result = liquidField(`{% if type == 'a' %}a{% else %}b{% endif %}`, vars, '');

        expect(result).toBe('a');
    });

    test('condition else', () => {
        ArgvService.set({
            applyPresets: false,
            resolveConditions: true
        } as YfmArgv);

        const vars = {type: 'b'};

        const result = liquidField(`{% if type == 'a' %}a{% else %}b{% endif %}`, vars, '');

        expect(result).toBe('b');
    });

    test('condition disabled', () => {
        ArgvService.set({
            applyPresets: false,
            resolveConditions: false
        } as YfmArgv);

        const vars = {type: 'a'};

        const result = liquidField(`{% if type == 'a' %}value{% endif %}`, vars, '');

        expect(result).toBe(`{% if type == 'a' %}value{% endif %}`);
    });

    test('condition and substitution', () => {
        ArgvService.set({
            applyPresets: true,
            resolveConditions: true
        } as YfmArgv);

        const vars = {type: 'a', a: 'a', b: 'b'};

        const result = liquidField(`{% if type == 'a' %}{{a}}{% else %}{{b}}{% endif %}`, vars, '');

        expect(result).toBe(vars.a);
    });

    test('condition and substitution disabled', () => {
        ArgvService.set({
            applyPresets: false,
            resolveConditions: false
        } as YfmArgv);

        const vars = {type: 'a', a: 'a', b: 'b'};

        const result = liquidField(`{% if type == 'a' %}{{a}}{% else %}{{b}}{% endif %}`, vars, '');

        expect(result).toBe(`{% if type == 'a' %}{{a}}{% else %}{{b}}{% endif %}`);
    });
});

describe('findAllValuesByKeys', () => {
    beforeEach(() => {
        jest.resetAllMocks();
    });

    test('should return an empty array if no values match the keys', () => {
        const obj = {a: 1, b: 2};
        const keysToFind = ['c', 'd'];
        const result = findAllValuesByKeys(obj, keysToFind);
        expect(result).toEqual([]);
    });

    test('should return an array of string values that match the keys', () => {
        const obj = {a: 'foo', b: 'bar', c: 'baz'};
        const keysToFind = ['a', 'b'];
        const result = findAllValuesByKeys(obj, keysToFind);
        expect(result).toEqual(['foo', 'bar']);
    });

    test('should return an array of string values from nested objects that match the keys', () => {
        const obj = {a: {b: 'foo'}, c: [{d: 'bar'}, {e: 'baz'}]};
        const keysToFind = ['b', 'd', 'e'];
        const result = findAllValuesByKeys(obj, keysToFind);
        expect(result).toEqual(['foo', 'bar', 'baz']);
    });

    test('should return an array of string values from arrays that match the keys', () => {
        const obj = {a: ['foo', 'bar'], b: [1, 2]};
        const keysToFind = ['a'];
        const result = findAllValuesByKeys(obj, keysToFind);
        expect(result).toEqual(['foo', 'bar']);
    });
});

import {filterDescription, filterFiles} from "services/utils";
import {Lang} from "../../../src/constants";

const combinedVars = {
    lang: Lang.EN,
};

describe('filterDescription', () => {
    test('string', () => {
        const description = 'test';

        const result = filterDescription(
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

        const result = filterDescription(
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
            text: 'line3',
        }];

        const result = filterDescription(
            description,
            combinedVars,
            {resolveConditions: true},
        );

        expect(result).toEqual(['line1', 'line3']);
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
            title: 'line3'
        }];

        const result = filterFiles(links, 'links', combinedVars, {resolveConditions: true});

        expect(result).toEqual([{
            title: 'line1',
        }, {
            title: 'line3',
        }]);
    });
});

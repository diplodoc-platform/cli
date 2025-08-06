import {describe, expect, it} from 'vitest';
import {filterMeta} from './meta';

describe('filterMeta', () => {
    it('should keep items without name field', () => {
        const meta: Hash[] = [
            {value: 'item1'},
            {name: 'interface', value: 'item2'},
            {name: 'customName', value: 'item3'},
        ];

        const result = filterMeta(meta);

        expect(result).toEqual([{value: 'item1'}, {name: 'customName', value: 'item3'}]);
    });

    it('should exclude items with name in YfmFields', () => {
        const meta: Hash[] = [
            {name: 'title', value: 'item1'},
            {name: 'interface', value: 'item2'},
            {name: 'resources', value: 'item3'},
        ];

        const result = filterMeta(meta);

        expect(result).toEqual([{name: 'title', value: 'item1'}]);
    });
});

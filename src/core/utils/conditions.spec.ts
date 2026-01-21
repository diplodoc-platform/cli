import {describe, expect, it} from 'vitest';

import {filterBlocksByConditions, hasWhenConditions} from './conditions';

describe('conditions', () => {
    describe('filterBlocksByConditions', () => {
        it('should filter array items by boolean when condition', () => {
            const data = [
                {type: 'block1', when: true},
                {type: 'block2', when: false},
                {type: 'block3', when: true},
            ];

            const result = filterBlocksByConditions(data, {}, false);

            expect(result).toHaveLength(2);
            expect(result[0]).toEqual({type: 'block1'});
            expect(result[1]).toEqual({type: 'block3'});
        });

        it('should filter array items by variable name', () => {
            const data = [
                {type: 'block1', when: 'showBlock1'},
                {type: 'block2', when: 'showBlock2'},
                {type: 'block3', when: 'showBlock3'},
            ];
            const vars = {
                showBlock1: true,
                showBlock2: false,
                showBlock3: 'yes',
            };

            const result = filterBlocksByConditions(data, vars, false);

            expect(result).toHaveLength(2);
            expect(result[0]).toEqual({type: 'block1'});
            expect(result[1]).toEqual({type: 'block3'});
        });

        it('should filter array items by equality check', () => {
            const data = [
                {type: 'block1', when: 'locale == "en"'},
                {type: 'block2', when: 'locale == "ru"'},
                {type: 'block3', when: 'locale == "de"'},
            ];
            const vars = {locale: 'en'};

            const result = filterBlocksByConditions(data, vars, false);

            expect(result).toHaveLength(1);
            expect(result[0]).toEqual({type: 'block1'});
        });

        it('should handle comparison operators', () => {
            const data = [
                {type: 'block1', when: 'version > 1'},
                {type: 'block2', when: 'version >= 2'},
                {type: 'block3', when: 'version < 3'},
                {type: 'block4', when: 'version <= 2'},
                {type: 'block5', when: 'version != 5'},
            ];
            const vars = {version: 2};

            const result = filterBlocksByConditions(data, vars, false);

            expect(result).toHaveLength(5);
            expect(result.map((r) => r.type)).toEqual([
                'block1',
                'block2',
                'block3',
                'block4',
                'block5',
            ]);
        });

        it('should remove when field after evaluation', () => {
            const data = [{type: 'block', when: true, content: 'test'}];

            const result = filterBlocksByConditions(data, {}, false);

            expect(result[0]).not.toHaveProperty('when');
            expect(result[0]).toEqual({type: 'block', content: 'test'});
        });

        it('should filter nested arrays', () => {
            const data = {
                blocks: [
                    {
                        type: 'container',
                        when: true,
                        children: [
                            {type: 'text', when: false, content: 'hidden'},
                            {type: 'text', when: true, content: 'visible'},
                        ],
                    },
                ],
            };

            const result = filterBlocksByConditions(data, {}, false);

            expect(result.blocks).toHaveLength(1);
            expect(result.blocks[0].children).toHaveLength(1);
            expect(result.blocks[0].children[0].content).toBe('visible');
        });

        it('should handle skipMissingVars true', () => {
            const data = [
                {type: 'block1', when: 'missingVar'},
                {type: 'block2', when: 'missingVar == "test"'},
            ];

            const result = filterBlocksByConditions(data, {}, true);

            expect(result).toHaveLength(2);
        });

        it('should handle skipMissingVars false', () => {
            const data = [
                {type: 'block1', when: 'missingVar'},
                {type: 'block2', when: 'missingVar == "test"'},
            ];

            const result = filterBlocksByConditions(data, {}, false);

            expect(result).toHaveLength(0);
        });

        it('should filter items with null when', () => {
            const data = [
                {type: 'block1', when: null},
                {type: 'block2', when: true},
            ];

            const result = filterBlocksByConditions(data, {}, false);

            expect(result).toHaveLength(1);
            expect(result[0].type).toBe('block2');
        });

        it('should filter items with undefined when', () => {
            const data = [
                {type: 'block1', when: undefined},
                {type: 'block2', when: true},
            ];

            const result = filterBlocksByConditions(data, {}, false);

            expect(result).toHaveLength(1);
            expect(result[0].type).toBe('block2');
        });

        it('should keep items without when field', () => {
            const data = [{type: 'block1'}, {type: 'block2', when: false}, {type: 'block3'}];

            const result = filterBlocksByConditions(data, {}, false);

            expect(result).toHaveLength(2);
            expect(result[0].type).toBe('block1');
            expect(result[1].type).toBe('block3');
        });

        it('should handle primitive values', () => {
            expect(filterBlocksByConditions('string', {}, false)).toBe('string');
            expect(filterBlocksByConditions(123, {}, false)).toBe(123);
            expect(filterBlocksByConditions(true, {}, false)).toBe(true);
            expect(filterBlocksByConditions(null, {}, false)).toBe(null);
        });

        it('should handle deep nested structures', () => {
            const data = {
                level1: {
                    level2: [
                        {
                            type: 'container',
                            when: true,
                            level3: {
                                items: [
                                    {type: 'text', when: false},
                                    {type: 'text', when: true, content: 'deep'},
                                ],
                            },
                        },
                    ],
                },
            };

            const result = filterBlocksByConditions(data, {}, false);

            expect(result.level1.level2[0].level3.items).toHaveLength(1);
            expect(result.level1.level2[0].level3.items[0].content).toBe('deep');
        });

        it('should handle equality with quotes', () => {
            const data = [
                {type: 'block1', when: "env == 'prod'"},
                {type: 'block2', when: 'env == "dev"'},
            ];
            const vars = {env: 'prod'};

            const result = filterBlocksByConditions(data, vars, false);

            expect(result).toHaveLength(1);
            expect(result[0].type).toBe('block1');
        });

        it('should handle complex object structures', () => {
            const data = {
                blocks: [
                    {
                        type: 'header',
                        when: 'showHeader',
                        props: {title: 'Title', subtitle: 'Subtitle'},
                    },
                    {
                        type: 'footer',
                        when: 'showFooter',
                        props: {copyright: '2024'},
                    },
                ],
            };
            const vars = {showHeader: true, showFooter: false};

            const result = filterBlocksByConditions(data, vars, false);

            expect(result.blocks).toHaveLength(1);
            expect(result.blocks[0].type).toBe('header');
            expect(result.blocks[0].props).toEqual({title: 'Title', subtitle: 'Subtitle'});
        });
    });

    describe('hasWhenConditions', () => {
        it('should return false for primitives', () => {
            expect(hasWhenConditions('string')).toBe(false);
            expect(hasWhenConditions(123)).toBe(false);
            expect(hasWhenConditions(true)).toBe(false);
            expect(hasWhenConditions(null)).toBe(false);
            expect(hasWhenConditions(undefined)).toBe(false);
        });

        it('should return false for empty array', () => {
            expect(hasWhenConditions([])).toBe(false);
        });

        it('should return false for empty object', () => {
            expect(hasWhenConditions({})).toBe(false);
        });

        it('should return true for object with when field', () => {
            expect(hasWhenConditions({when: true})).toBe(true);
            expect(hasWhenConditions({when: false})).toBe(true);
            expect(hasWhenConditions({when: 'condition'})).toBe(true);
        });

        it('should return true for array with when field', () => {
            expect(hasWhenConditions([{type: 'block', when: true}])).toBe(true);
        });

        it('should return false for array without when fields', () => {
            expect(hasWhenConditions([{type: 'block1'}, {type: 'block2'}])).toBe(false);
        });

        it('should detect when in nested objects', () => {
            const data = {
                blocks: [
                    {
                        type: 'container',
                        children: [{type: 'text', when: true}],
                    },
                ],
            };

            expect(hasWhenConditions(data)).toBe(true);
        });

        it('should detect when in deeply nested structures', () => {
            const data = {
                level1: {
                    level2: {
                        level3: {
                            items: [{when: 'condition'}],
                        },
                    },
                },
            };

            expect(hasWhenConditions(data)).toBe(true);
        });

        it('should return false when no when fields exist', () => {
            const data = {
                blocks: [
                    {
                        type: 'container',
                        props: {title: 'Title'},
                        children: [{type: 'text', content: 'Text'}],
                    },
                ],
            };

            expect(hasWhenConditions(data)).toBe(false);
        });

        it('should handle mixed structures', () => {
            const data = {
                header: {title: 'Header'},
                blocks: [{type: 'block1'}, {type: 'block2', when: true}],
                footer: {copyright: '2024'},
            };

            expect(hasWhenConditions(data)).toBe(true);
        });

        it('should handle arrays with nested objects', () => {
            const data = [
                {
                    items: [{value: 1}, {value: 2, when: 'show'}],
                },
            ];

            expect(hasWhenConditions(data)).toBe(true);
        });
    });
});

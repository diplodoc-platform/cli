import {describe, expect, it} from 'vitest';
import {compareJson} from './index';

describe('json utils', () => {
    describe('compareJson', () => {
        it('should detect added properties', () => {
            const oldObj = {a: 1, b: 2};
            const newObj = {a: 1, b: 2, c: 3, d: 4};

            const result = compareJson(oldObj, newObj);

            expect(result.added).toEqual(['c', 'd']);
            expect(result.changed).toEqual([]);
            expect(result.removed).toEqual([]);
        });

        it('should detect removed properties', () => {
            const oldObj = {a: 1, b: 2, c: 3, d: 4};
            const newObj = {a: 1, b: 2};

            const result = compareJson(oldObj, newObj);

            expect(result.added).toEqual([]);
            expect(result.changed).toEqual([]);
            expect(result.removed).toEqual(['c', 'd']);
        });

        it('should detect changed properties', () => {
            const oldObj = {a: 1, b: 2, c: 3};
            const newObj = {a: 1, b: 5, c: 3};

            const result = compareJson(oldObj, newObj);

            expect(result.added).toEqual([]);
            expect(result.changed).toEqual(['b']);
            expect(result.removed).toEqual([]);
        });

        it('should handle nested objects', () => {
            const oldObj = {
                a: 1,
                b: {x: 1, y: 2},
                c: {z: 3},
            };
            const newObj = {
                a: 1,
                b: {x: 1, y: 5, w: 4},
                c: {z: 3},
            };

            const result = compareJson(oldObj, newObj);

            expect(result.added).toEqual(['b.w']);
            expect(result.changed).toEqual(['b.y']);
            expect(result.removed).toEqual([]);
        });

        it('should handle deep nested objects', () => {
            const oldObj = {
                a: {
                    b: {
                        c: {d: 1, e: 2},
                    },
                },
            };
            const newObj = {
                a: {
                    b: {
                        c: {d: 1, e: 5, f: 6},
                    },
                },
            };

            const result = compareJson(oldObj, newObj);

            expect(result.added).toEqual(['a.b.c.f']);
            expect(result.changed).toEqual(['a.b.c.e']);
            expect(result.removed).toEqual([]);
        });

        it('should handle arrays', () => {
            const oldObj = {
                items: [1, 2, 3],
                nested: [{a: 1}, {b: 2}],
            };
            const newObj = {
                items: [1, 5, 3],
                nested: [{a: 1}, {b: 3}, {c: 4}],
            };

            const result = compareJson(oldObj, newObj);

            expect(result.added).toEqual(['nested[2]']);
            expect(result.changed).toEqual(['items[1]', 'nested[1].b']);
            expect(result.removed).toEqual([]);
        });

        it('should handle mixed changes', () => {
            const oldObj = {
                a: 1,
                b: {x: 1, y: 2},
                c: [1, 2, 3],
                d: 4,
            };
            const newObj = {
                a: 1,
                b: {x: 1, z: 3},
                c: [1, 5, 3],
                e: 6,
            };

            const result = compareJson(oldObj, newObj);

            expect(result.added).toEqual(['b.z', 'e']);
            expect(result.changed).toEqual(['c[1]']);
            expect(result.removed).toEqual(['b.y', 'd']);
        });

        it('should handle null and undefined values', () => {
            const oldObj = {
                a: null,
                b: undefined,
                c: 1,
            };
            const newObj = {
                a: 1,
                b: null,
                c: 1,
            };

            const result = compareJson(oldObj, newObj);

            expect(result.added).toEqual([]);
            expect(result.changed).toEqual(['a', 'b']);
            expect(result.removed).toEqual([]);
        });

        it('should handle type changes', () => {
            const oldObj = {
                a: 1,
                b: 'string',
                c: [1, 2, 3],
            };
            const newObj = {
                a: '1',
                b: 42,
                c: {x: 1},
            };

            const result = compareJson(oldObj, newObj);

            expect(result.added).toEqual([]);
            expect(result.changed).toEqual(['a', 'b', 'c']);
            expect(result.removed).toEqual([]);
        });

        it('should return empty arrays for identical objects', () => {
            const obj = {
                a: 1,
                b: {x: 1, y: 2},
                c: [1, 2, 3],
            };

            const result = compareJson(obj, obj);

            expect(result.added).toEqual([]);
            expect(result.changed).toEqual([]);
            expect(result.removed).toEqual([]);
        });

        it('should handle empty objects', () => {
            const oldObj = {};
            const newObj = {a: 1};

            const result = compareJson(oldObj, newObj);

            expect(result.added).toEqual(['a']);
            expect(result.changed).toEqual([]);
            expect(result.removed).toEqual([]);
        });

        it('should handle complex nested structures', () => {
            const oldObj = {
                propA: {
                    prop1: 1,
                    prop2: 2,
                },
                propB: {
                    prop1: 3,
                },
                propC: 4,
            };
            const newObj = {
                propA: {
                    prop1: 1,
                    prop2: 2,
                },
                propB: {
                    prop1: 5,
                },
                propD: {
                    prop1: {
                        prop2: 6,
                    },
                },
            };

            const result = compareJson(oldObj, newObj);

            expect(result.added).toEqual(['propD', 'propD.prop1', 'propD.prop1.prop2']);
            expect(result.changed).toEqual(['propB.prop1']);
            expect(result.removed).toEqual(['propC']);
        });

        it('should handle root level arrays', () => {
            const oldArr = [1, 2, 3];
            const newArr = [1, 5, 3, 4];

            const result = compareJson(oldArr, newArr);

            expect(result.added).toEqual(['[3]']);
            expect(result.changed).toEqual(['[1]']);
            expect(result.removed).toEqual([]);
        });

        it('should handle empty arrays', () => {
            const oldArr: any[] = [];
            const newArr = [1, 2, 3];

            const result = compareJson(oldArr, newArr);

            expect(result.added).toEqual(['[0]', '[1]', '[2]']);
            expect(result.changed).toEqual([]);
            expect(result.removed).toEqual([]);
        });

        it('should handle objects with array properties', () => {
            const oldObj = {
                users: [
                    {id: 1, name: 'Alice'},
                    {id: 2, name: 'Bob'},
                ],
            };
            const newObj = {
                users: [
                    {id: 1, name: 'Alice'},
                    {id: 2, name: 'Bob Updated'},
                    {id: 3, name: 'Charlie'},
                ],
            };

            const result = compareJson(oldObj, newObj);

            expect(result.added).toEqual(['users[2]']);
            expect(result.changed).toEqual(['users[1].name']);
            expect(result.removed).toEqual([]);
        });
    });
});

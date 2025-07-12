import {describe, expect, it} from 'vitest';
import {Graph} from '.';

describe('Graph', () => {
    describe('extract', () => {
        it('should return empty graph for non-existent node', () => {
            const graph = new Graph();
            const extracted = graph.extract('non-existent');
            expect(extracted.serialize()).toEqual({nodes: [], dependencies: [], __type: '$$Graph'});
        });

        it('should extract single node without dependencies', () => {
            const graph = new Graph();
            graph.addNode('A');
            graph.setNodeData('A', {type: 'file'});
            const extracted = graph.extract('A');
            expect(extracted.serialize()).toEqual({
                nodes: [{name: 'A', data: {type: 'file'}}],
                dependencies: [],
                __type: '$$Graph',
            });
        });

        it('should extract node with dependencies', () => {
            const graph = new Graph();
            graph.addNode('A');
            graph.addNode('B');
            graph.addNode('C');
            graph.addDependency('A', 'B');
            graph.addDependency('B', 'C');
            graph.setNodeData('A', {type: 'file'});
            graph.setNodeData('B', {type: 'config'});
            graph.setNodeData('C', {type: 'preset'});
            const extracted = graph.extract('A');
            expect(extracted.serialize()).toEqual({
                nodes: [
                    {name: 'A', data: {type: 'file'}},
                    {name: 'B', data: {type: 'config'}},
                    {name: 'C', data: {type: 'preset'}},
                ],
                dependencies: [
                    {from: 'A', to: 'B'},
                    {from: 'B', to: 'C'},
                ],
                __type: '$$Graph',
            });
        });

        it('should extract node with dependents', () => {
            const graph = new Graph();
            graph.addNode('A');
            graph.addNode('B');
            graph.addNode('C');
            graph.addDependency('B', 'A');
            graph.addDependency('C', 'A');
            graph.setNodeData('A', {type: 'config'});
            graph.setNodeData('B', {type: 'file1'});
            graph.setNodeData('C', {type: 'file2'});
            const extracted = graph.extract('A');
            expect(extracted.serialize()).toEqual({
                nodes: [
                    {name: 'A', data: {type: 'config'}},
                    {name: 'B', data: {type: 'file1'}},
                    {name: 'C', data: {type: 'file2'}},
                ],
                dependencies: [
                    {from: 'B', to: 'A'},
                    {from: 'C', to: 'A'},
                ],
                __type: '$$Graph',
            });
        });

        it('should extract complex dependency chain', () => {
            const graph = new Graph();
            // Create dependency chain: A -> B -> C -> D
            graph.addNode('A');
            graph.addNode('B');
            graph.addNode('C');
            graph.addNode('D');
            graph.addDependency('A', 'B');
            graph.addDependency('B', 'C');
            graph.addDependency('C', 'D');
            const extracted = graph.extract('B');
            expect(extracted.serialize()).toEqual({
                nodes: [
                    {name: 'A', data: 'A'},
                    {name: 'B', data: 'B'},
                    {name: 'C', data: 'C'},
                    {name: 'D', data: 'D'},
                ],
                dependencies: [
                    {from: 'A', to: 'B'},
                    {from: 'B', to: 'C'},
                    {from: 'C', to: 'D'},
                ],
                __type: '$$Graph',
            });
        });

        it('should extract node with both dependencies and dependents', () => {
            const graph = new Graph();
            // Create graph: X -> A -> B -> Y
            graph.addNode('X');
            graph.addNode('A');
            graph.addNode('B');
            graph.addNode('Y');
            graph.addDependency('A', 'X');
            graph.addDependency('B', 'A');
            graph.addDependency('Y', 'B');
            const extracted = graph.extract('A');
            expect(extracted.serialize()).toEqual({
                nodes: [
                    {name: 'A', data: 'A'},
                    {name: 'B', data: 'B'},
                    {name: 'X', data: 'X'},
                    {name: 'Y', data: 'Y'},
                ],
                dependencies: [
                    {from: 'A', to: 'X'},
                    {from: 'B', to: 'A'},
                    {from: 'Y', to: 'B'},
                ],
                __type: '$$Graph',
            });
        });

        it('should preserve node data in extracted graph', () => {
            const graph = new Graph();
            graph.addNode('A');
            graph.addNode('B');
            graph.addDependency('A', 'B');
            graph.setNodeData('A', {type: 'file'});
            graph.setNodeData('B', {type: 'config'});
            const extracted = graph.extract('A');
            expect(extracted.serialize()).toEqual({
                nodes: [
                    {name: 'A', data: {type: 'file'}},
                    {name: 'B', data: {type: 'config'}},
                ],
                dependencies: [{from: 'A', to: 'B'}],
                __type: '$$Graph',
            });
        });

        it('should not include unrelated nodes', () => {
            const graph = new Graph();
            graph.addNode('A');
            graph.addNode('B');
            graph.addNode('C');
            graph.addNode('D');
            graph.addDependency('A', 'B');
            graph.addDependency('C', 'D'); // Unrelated pair
            const extracted = graph.extract('A');
            expect(extracted.serialize()).toEqual({
                nodes: [
                    {name: 'A', data: 'A'},
                    {name: 'B', data: 'B'},
                ],
                dependencies: [{from: 'A', to: 'B'}],
                __type: '$$Graph',
            });
        });

        it('should handle multiple independent paths', () => {
            const graph = new Graph();
            // Create two independent paths converging at one point
            // A -> B -> C
            // D -> B -> C
            graph.addNode('A');
            graph.addNode('B');
            graph.addNode('C');
            graph.addNode('D');
            graph.addDependency('A', 'B');
            graph.addDependency('D', 'B');
            graph.addDependency('B', 'C');
            const extracted = graph.extract('B');
            expect(extracted.serialize()).toEqual({
                nodes: [
                    {name: 'A', data: 'A'},
                    {name: 'B', data: 'B'},
                    {name: 'C', data: 'C'},
                    {name: 'D', data: 'D'},
                ],
                dependencies: [
                    {from: 'A', to: 'B'},
                    {from: 'B', to: 'C'},
                    {from: 'D', to: 'B'},
                ],
                __type: '$$Graph',
            });
        });
    });

    describe('serialize', () => {
        it('should serialize empty graph', () => {
            const graph = new Graph();
            expect(graph.serialize()).toEqual({nodes: [], dependencies: [], __type: '$$Graph'});
        });

        it('should serialize graph with single node', () => {
            const graph = new Graph();
            graph.addNode('A');
            graph.setNodeData('A', {type: 'file'});
            expect(graph.serialize()).toEqual({
                nodes: [{name: 'A', data: {type: 'file'}}],
                dependencies: [],
                __type: '$$Graph',
            });
        });

        it('should serialize graph with dependencies', () => {
            const graph = new Graph();
            graph.addNode('A');
            graph.addNode('B');
            graph.addNode('C');
            graph.addDependency('A', 'B');
            graph.addDependency('B', 'C');
            graph.setNodeData('A', {type: 'file'});
            graph.setNodeData('B', {type: 'config'});
            graph.setNodeData('C', {type: 'preset'});
            expect(graph.serialize()).toEqual({
                nodes: [
                    {name: 'A', data: {type: 'file'}},
                    {name: 'B', data: {type: 'config'}},
                    {name: 'C', data: {type: 'preset'}},
                ],
                dependencies: [
                    {from: 'A', to: 'B'},
                    {from: 'B', to: 'C'},
                ],
                __type: '$$Graph',
            });
        });

        it('should serialize complex graph structure', () => {
            const graph = new Graph();
            // Create graph: A -> B -> C, A -> D
            graph.addNode('A');
            graph.addNode('B');
            graph.addNode('C');
            graph.addNode('D');
            graph.addDependency('A', 'B');
            graph.addDependency('B', 'C');
            graph.addDependency('A', 'D');
            expect(graph.serialize()).toEqual({
                nodes: [
                    {name: 'A', data: 'A'},
                    {name: 'B', data: 'B'},
                    {name: 'C', data: 'C'},
                    {name: 'D', data: 'D'},
                ],
                dependencies: [
                    {from: 'A', to: 'B'},
                    {from: 'A', to: 'D'},
                    {from: 'B', to: 'C'},
                ],
                __type: '$$Graph',
            });
        });
    });

    describe('consume', () => {
        it('should consume empty serialized graph', () => {
            const graph = new Graph();
            const serialized = {nodes: [], dependencies: []};
            graph.consume(serialized);
            expect(graph.serialize()).toEqual({nodes: [], dependencies: [], __type: '$$Graph'});
        });

        it('should consume serialized graph with single node', () => {
            const graph = new Graph();
            const serialized = {
                nodes: [{name: 'A', data: {type: 'file'}}],
                dependencies: [],
                __type: '$$Graph',
            };
            graph.consume(serialized);
            expect(graph.serialize()).toEqual({
                nodes: [{name: 'A', data: {type: 'file'}}],
                dependencies: [],
                __type: '$$Graph',
            });
        });

        it('should consume serialized graph with dependencies', () => {
            const graph = new Graph();
            const serialized = {
                nodes: [
                    {name: 'A', data: {type: 'file'}},
                    {name: 'B', data: {type: 'config'}},
                    {name: 'C', data: {type: 'preset'}},
                ],
                dependencies: [
                    {from: 'A', to: 'B'},
                    {from: 'B', to: 'C'},
                ],
                __type: '$$Graph',
            };
            graph.consume(serialized);
            expect(graph.serialize()).toEqual({
                nodes: [
                    {name: 'A', data: {type: 'file'}},
                    {name: 'B', data: {type: 'config'}},
                    {name: 'C', data: {type: 'preset'}},
                ],
                dependencies: [
                    {from: 'A', to: 'B'},
                    {from: 'B', to: 'C'},
                ],
                __type: '$$Graph',
            });
        });

        it('should work with extract and serialize workflow', () => {
            const originalGraph = new Graph();
            originalGraph.addNode('A');
            originalGraph.addNode('B');
            originalGraph.addNode('C');
            originalGraph.addNode('D');
            originalGraph.addDependency('A', 'B');
            originalGraph.addDependency('B', 'C');
            originalGraph.addDependency('A', 'D');
            originalGraph.setNodeData('A', {type: 'file'});
            originalGraph.setNodeData('B', {type: 'config'});
            originalGraph.setNodeData('C', {type: 'preset'});
            originalGraph.setNodeData('D', {type: 'template'});
            // Extract subgraph and serialize it
            const extractedGraph = originalGraph.extract('A');
            const serialized = extractedGraph.serialize();
            // Create new graph and consume serialized data
            const newGraph = new Graph();
            newGraph.consume(serialized);
            // Check that graphs are identical
            expect(newGraph.serialize()).toEqual(extractedGraph.serialize());
        });
    });

    describe('release', () => {
        it('should remove single node and its parent if parent has no more children', () => {
            const graph = new Graph();
            graph.addNode('A');
            graph.addNode('B');
            graph.addDependency('A', 'B'); // A depends on B

            graph.release('A');

            expect(graph.serialize()).toEqual({
                nodes: [],
                dependencies: [],
                __type: '$$Graph',
            });
        });

        it('should remove node and recursively remove parents without children', () => {
            const graph = new Graph();
            graph.addNode('A');
            graph.addNode('B');
            graph.addNode('C');
            graph.addDependency('A', 'B'); // A depends on B
            graph.addDependency('B', 'C'); // B depends on C

            graph.release('A');

            expect(graph.serialize()).toEqual({
                nodes: [],
                dependencies: [],
                __type: '$$Graph',
            });
        });

        it('should remove only the specified node when it has no parents', () => {
            const graph = new Graph();
            graph.addNode('A');
            graph.addNode('B');
            graph.addDependency('A', 'B'); // A depends on B

            graph.release('B');

            expect(graph.serialize()).toEqual({
                nodes: [{name: 'A', data: 'A'}],
                dependencies: [],
                __type: '$$Graph',
            });
        });

        it('should handle non-existent node gracefully', () => {
            const graph = new Graph();
            graph.addNode('A');

            // Should not throw an error
            expect(() => graph.release('non-existent')).not.toThrow();

            expect(graph.serialize()).toEqual({
                nodes: [{name: 'A', data: 'A'}],
                dependencies: [],
                __type: '$$Graph',
            });
        });

        it('should preserve data of remaining nodes', () => {
            const graph = new Graph();
            graph.addNode('A');
            graph.addNode('B');
            graph.addNode('C');
            graph.addDependency('A', 'B'); // A depends on B
            graph.addDependency('C', 'B'); // C depends on B
            graph.setNodeData('B', {type: 'config'});
            graph.setNodeData('C', {type: 'file'});

            graph.release('B');

            expect(graph.serialize()).toEqual({
                nodes: [
                    {name: 'A', data: 'A'},
                    {name: 'C', data: {type: 'file'}},
                ],
                dependencies: [],
                __type: '$$Graph',
            });
            // Check that data is preserved
            expect(graph.getNodeData('C')).toEqual({type: 'file'});
        });
    });
});

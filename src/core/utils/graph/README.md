# Graph API

The `Graph` class extends `DepGraph` from the `dependency-graph` library and provides additional methods for working with dependency graphs.

## Overview

The Graph class provides a robust way to manage dependency relationships between nodes, with support for serialization, subgraph extraction, and node removal operations.

## Main Methods

### `extract(nodeName: string): Graph`
Extracts a subgraph related to the specified node, including all its dependencies and dependent nodes.

```typescript
const graph = new Graph();
graph.addNode('A');
graph.addNode('B');
graph.addNode('C');
graph.addDependency('A', 'B');
graph.addDependency('B', 'C');

const extracted = graph.extract('A');
// extracted contains nodes A, B, C and their dependencies
```

### `serialize(): SerializedGraph`
Serializes the graph to a format suitable for transfer between threads. Nodes and dependencies are sorted for predictable output.

```typescript
const graph = new Graph();
graph.addNode('A');
graph.addNode('B');
graph.addDependency('A', 'B');

const serialized = graph.serialize();
// {
//   nodes: [
//     { name: 'A', data: 'A' },
//     { name: 'B', data: 'B' }
//   ],
//   dependencies: [
//     { from: 'A', to: 'B' }
//   ]
// }
```

### `consume(serializedGraph: SerializedGraph | undefined): void`
Consumes a serialized graph, adding all nodes and dependencies to the current graph.

```typescript
const graph = new Graph();
const serialized = {
  nodes: [
    { name: 'A', data: {type: 'file'} },
    { name: 'B', data: {type: 'config'} }
  ],
  dependencies: [
    { from: 'A', to: 'B' }
  ]
};

graph.consume(serialized);
// graph now contains nodes A, B and dependency A -> B
```

### `release(nodeName: string): void`
Removes a node from the graph. If the node's dependencies have no other dependants, they will be removed too (recursively).

```typescript
const graph = new Graph();
graph.addNode('A');
graph.addNode('B');
graph.addNode('C');
graph.addDependency('A', 'B');
graph.addDependency('B', 'C');

graph.release('A');
// Removes A, then B (no more dependants), then C (no more dependants)
// Result: empty graph
```

## Types

### `SerializedGraph`
```typescript
type SerializedGraph = {
    nodes: Array<{
        name: string;
        data?: {type: string} | string;
    }>;
    dependencies: Array<{
        from: string;
        to: string;
    }>;
};
```

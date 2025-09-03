import {DepGraph} from 'dependency-graph';

export type SerializedGraph<Data = {type: string}> = {
    nodes: Array<{
        name: string;
        data?: Data;
    }>;
    dependencies: Array<{
        from: string;
        to: string;
    }>;
};

export class Graph<Data = {type: string}> extends DepGraph<Data> {
    static is<Data = {type: string}>(data: unknown): data is SerializedGraph<Data> {
        return Boolean(
            data instanceof Graph ||
                (data && typeof data === 'object' && '__type' in data && data.__type === '$$Graph'),
        );
    }

    static deserialize(message: SerializedGraph) {
        return new Graph().consume(message);
    }

    /**
     * Extracts a subgraph related to the specified node
     * @param nodeName - name of the node for which to extract the subgraph
     * @returns new Graph instance with the extracted subgraph
     */
    extract(nodeName: string): Graph<Data> {
        const extractedGraph = new Graph<Data>();

        if (!this.hasNode(nodeName)) {
            return extractedGraph;
        }

        // Recursively copy dependencies (nodes that the initial node depends on)
        this.copyDependenciesRecursively(nodeName, extractedGraph, new Set());

        // Recursively copy dependent nodes (nodes that depend on the initial node)
        this.copyDependentsRecursively(nodeName, extractedGraph, new Set());

        return extractedGraph;
    }

    /**
     * Consumes a serialized graph
     */
    consume(graph: Graph<any> | SerializedGraph<Data> | undefined): this {
        if (!graph) {
            return this;
        }

        if (graph instanceof Graph) {
            graph = graph.serialize();
        }

        // First add all nodes
        for (const node of graph.nodes) {
            this.addNode(node.name);
            if (node.data) {
                this.setNodeData(node.name, node.data);
            }
        }

        // Then add all dependencies
        for (const dep of graph.dependencies) {
            this.addDependency(dep.from, dep.to);
        }

        return this;
    }

    /**
     * Removes node from graph
     * If node dependencies has no other dependants, they will be removed too
     * @param nodeName - node name to remove
     */
    release(nodeName: string): this {
        if (!this.hasNode(nodeName)) {
            return this;
        }

        // Get direct parents before removing the node
        const directParents = this.directDependenciesOf(nodeName);

        // Remove all incoming dependencies (parents -> node)
        for (const parent of directParents) {
            this.removeDependency(nodeName, parent);
        }

        // Remove all outgoing dependencies (node -> children)
        const directDependents = this.directDependentsOf(nodeName);
        for (const dependent of directDependents) {
            this.removeDependency(dependent, nodeName);
        }

        // Remove the node itself
        this.removeNode(nodeName);

        // Recursively remove parents that have no children left
        for (const parent of directParents) {
            if (this.hasNode(parent) && this.directDependentsOf(parent).length === 0) {
                this.release(parent);
            }
        }

        return this;
    }

    /**
     * Serializes the graph to a format for transfer between threads
     * @returns serialized representation of the graph
     */
    serialize(): SerializedGraph<Data> {
        const nodes: SerializedGraph<Data>['nodes'] = [];
        const dependencies: SerializedGraph['dependencies'] = [];

        // Get all nodes in the graph
        const allNodes = this.overallOrder();

        for (const nodeName of allNodes) {
            const nodeData = this.getNodeData(nodeName);
            nodes.push({
                name: nodeName,
                data: nodeData,
            });
        }

        // Get all dependencies
        for (const nodeName of allNodes) {
            const directDeps = this.directDependenciesOf(nodeName);
            for (const dep of directDeps) {
                dependencies.push({
                    from: nodeName,
                    to: dep,
                });
            }
        }

        nodes.sort((a, b) => (a.name > b.name ? 1 : -1));
        dependencies.sort((a, b) => {
            if (a.from === b.from) {
                return a.to > b.to ? 1 : -1;
            }
            return a.from > b.from ? 1 : -1;
        });

        return {nodes, dependencies, __type: '$$Graph'} as SerializedGraph<Data>;
    }

    /**
     * Recursively copies node dependencies
     */
    private copyDependenciesRecursively(
        nodeName: string,
        targetGraph: Graph<Data>,
        processed: Set<string>,
    ): void {
        if (processed.has(nodeName)) {
            return;
        }

        processed.add(nodeName);

        // Add node to target graph
        if (!targetGraph.hasNode(nodeName)) {
            targetGraph.addNode(nodeName);
            const nodeData = this.getNodeData(nodeName);
            if (nodeData) {
                targetGraph.setNodeData(nodeName, nodeData);
            }
        }

        // Recursively process only direct dependencies
        const dependencies = this.directDependenciesOf(nodeName);
        for (const dep of dependencies) {
            this.copyDependenciesRecursively(dep, targetGraph, processed);
            targetGraph.addDependency(nodeName, dep);
        }
    }

    /**
     * Recursively copies dependent nodes
     */
    private copyDependentsRecursively(
        nodeName: string,
        targetGraph: Graph<Data>,
        processed: Set<string>,
    ): void {
        if (processed.has(nodeName)) {
            return;
        }

        processed.add(nodeName);

        // Add node to target graph
        if (!targetGraph.hasNode(nodeName)) {
            targetGraph.addNode(nodeName);
            const nodeData = this.getNodeData(nodeName);
            if (nodeData) {
                targetGraph.setNodeData(nodeName, nodeData);
            }
        }

        // Recursively process only direct dependent nodes
        const dependents = this.directDependentsOf(nodeName);
        for (const dep of dependents) {
            this.copyDependentsRecursively(dep, targetGraph, processed);
            targetGraph.addDependency(dep, nodeName);
        }
    }
}

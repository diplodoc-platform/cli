import {DepGraph} from 'dependency-graph';

type GraphData = {
    path: NormalizedPath;
    deps?: GraphData[];
};

export class Graph extends DepGraph<{type: string}> {
    consume(graph: GraphData | undefined) {
        if (!graph) {
            return;
        }

        const {path, deps} = graph;

        this.addNode(path);
        this.setNodeData(path);

        for (const dep of deps || []) {
            this.addNode(dep.path);
            this.addDependency(path, dep.path);

            if (dep.deps?.length) {
                this.consume(dep);
            }
        }
    }

    releaseDependencies(node: string) {
        const deps = this.dependenciesOf(node);

        for (const dep of deps) {
            const ascs = this.dependentsOf(dep);
            if (ascs.length === 1) {
                this.releaseDependencies(dep);
                this.removeNode(dep);
            } else {
                this.removeDependency(node, dep);
            }
        }
    }
}

// eslint-disable-next-line @typescript-eslint/no-var-requires
const graphology = require('graphology');
const Graph = graphology.default ?? graphology.Graph ?? graphology;
export class InosGraphEngine {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    graph;
    constructor(initialGraph) {
        this.graph = new Graph({ multi: true, allowSelfLoops: false, type: 'directed' });
        if (initialGraph) {
            for (const node of initialGraph.nodes) {
                this.graph.addNode(node.id, node);
            }
            for (const edge of initialGraph.edges) {
                this.graph.addEdge(edge.sourceId, edge.targetId, edge);
            }
        }
    }
    addNode(node) {
        this.graph.addNode(node.id, node);
    }
    getNode(nodeId) {
        if (!this.graph.hasNode(nodeId))
            return undefined;
        return this.graph.getNodeAttributes(nodeId);
    }
    removeNode(nodeId) {
        this.graph.dropNode(nodeId);
    }
    getEdgesForNode(nodeId) {
        return this.graph.mapAdjacentEdges((_edgeId, attrs) => attrs);
    }
    getDescendants(nodeId) {
        const descendants = [];
        this.graph.forEachOutNeighbor(nodeId, (neighbor) => {
            descendants.push(neighbor);
        });
        return descendants;
    }
    getBranch(rootId) {
        const visited = new Set();
        const nodes = [];
        const edges = [];
        const walk = (id) => {
            if (visited.has(id))
                return;
            visited.add(id);
            const node = this.getNode(id);
            if (node)
                nodes.push(node);
            this.graph.forEachOutEdge(id, (eid) => {
                const edge = this.graph.getEdgeAttributes(eid);
                edges.push(edge);
                const target = this.graph.target(eid);
                walk(target);
            });
        };
        walk(rootId);
        return { nodes, edges };
    }
    addEdge(edge) {
        this.graph.addEdge(edge.sourceId, edge.targetId, edge);
        this.validateDAG();
    }
    get allNodes() {
        return this.graph.mapNodes((_id, attrs) => attrs);
    }
    get allEdges() {
        return this.graph.mapEdges((_eid, attrs) => attrs);
    }
    validateDAG() {
        if (!this.graph.isDAG()) {
            throw new Error('Cycle detected in graph. Inos graphs must be DAGs.');
        }
    }
}
//# sourceMappingURL=graph.js.map
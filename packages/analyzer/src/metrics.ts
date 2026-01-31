import type Graph from 'graphology';
import type { NetworkMetrics } from './types.js';

/**
 * Calculate PageRank for all nodes in a directed graph.
 * Iterative power-method implementation.
 */
export function calculatePageRank(
  graph: Graph,
  options: { damping?: number; iterations?: number; tolerance?: number } = {},
): Map<string, number> {
  const { damping = 0.85, iterations = 100, tolerance = 1e-6 } = options;
  const nodes = graph.nodes();
  const N = nodes.length;
  if (N === 0) return new Map();

  let ranks = new Map<string, number>();
  const initial = 1 / N;
  for (const node of nodes) {
    ranks.set(node, initial);
  }

  for (let iter = 0; iter < iterations; iter++) {
    const newRanks = new Map<string, number>();
    let diff = 0;

    for (const node of nodes) {
      let sum = 0;
      // Incoming edges
      graph.forEachInEdge(node, (_edge, _attrs, source) => {
        const outDeg = graph.outDegree(source);
        if (outDeg > 0) {
          sum += (ranks.get(source) ?? 0) / outDeg;
        }
      });

      const newRank = (1 - damping) / N + damping * sum;
      newRanks.set(node, newRank);
      diff += Math.abs(newRank - (ranks.get(node) ?? 0));
    }

    ranks = newRanks;
    if (diff < tolerance) break;
  }

  return ranks;
}

/**
 * Calculate betweenness centrality using Brandes' algorithm.
 * For large graphs, uses sampling for approximation.
 */
export function calculateBetweenness(graph: Graph, sampleSize?: number): Map<string, number> {
  const nodes = graph.nodes();
  const N = nodes.length;
  const betweenness = new Map<string, number>();
  for (const node of nodes) {
    betweenness.set(node, 0);
  }

  // For large graphs, sample a subset of source nodes
  const sources = sampleSize && sampleSize < N
    ? shuffleArray(nodes).slice(0, sampleSize)
    : nodes;

  for (const s of sources) {
    // BFS / shortest path counting
    const stack: string[] = [];
    const pred = new Map<string, string[]>();
    const sigma = new Map<string, number>();
    const dist = new Map<string, number>();
    const delta = new Map<string, number>();

    for (const node of nodes) {
      pred.set(node, []);
      sigma.set(node, 0);
      dist.set(node, -1);
      delta.set(node, 0);
    }

    sigma.set(s, 1);
    dist.set(s, 0);
    const queue: string[] = [s];

    while (queue.length > 0) {
      const v = queue.shift()!;
      stack.push(v);

      graph.forEachOutNeighbor(v, (w) => {
        if (dist.get(w)! < 0) {
          queue.push(w);
          dist.set(w, dist.get(v)! + 1);
        }
        if (dist.get(w) === dist.get(v)! + 1) {
          sigma.set(w, sigma.get(w)! + sigma.get(v)!);
          pred.get(w)!.push(v);
        }
      });
    }

    while (stack.length > 0) {
      const w = stack.pop()!;
      for (const v of pred.get(w)!) {
        const d = (sigma.get(v)! / sigma.get(w)!) * (1 + delta.get(w)!);
        delta.set(v, delta.get(v)! + d);
      }
      if (w !== s) {
        betweenness.set(w, betweenness.get(w)! + delta.get(w)!);
      }
    }
  }

  // Normalize
  const scaleFactor = sources.length < N ? N / sources.length : 1;
  if (N > 2) {
    const norm = 1 / ((N - 1) * (N - 2));
    for (const node of nodes) {
      betweenness.set(node, betweenness.get(node)! * norm * scaleFactor);
    }
  }

  return betweenness;
}

/**
 * Calculate closeness centrality.
 */
export function calculateCloseness(graph: Graph): Map<string, number> {
  const nodes = graph.nodes();
  const closeness = new Map<string, number>();

  for (const s of nodes) {
    // BFS to find distances
    const dist = new Map<string, number>();
    dist.set(s, 0);
    const queue: string[] = [s];
    let totalDist = 0;
    let reachable = 0;

    while (queue.length > 0) {
      const v = queue.shift()!;
      const d = dist.get(v)!;

      graph.forEachOutNeighbor(v, (w) => {
        if (!dist.has(w)) {
          dist.set(w, d + 1);
          totalDist += d + 1;
          reachable++;
          queue.push(w);
        }
      });
    }

    closeness.set(s, reachable > 0 ? reachable / totalDist : 0);
  }

  return closeness;
}

/**
 * Calculate local clustering coefficient for each node.
 */
export function calculateClustering(graph: Graph): Map<string, number> {
  const clustering = new Map<string, number>();

  graph.forEachNode((node) => {
    const neighbors = new Set(graph.neighbors(node));
    const k = neighbors.size;

    if (k < 2) {
      clustering.set(node, 0);
      return;
    }

    let triangles = 0;
    for (const u of neighbors) {
      for (const v of neighbors) {
        if (u !== v && graph.hasEdge(u, v)) {
          triangles++;
        }
      }
    }

    clustering.set(node, triangles / (k * (k - 1)));
  });

  return clustering;
}

/**
 * Apply all metrics to the graph as node attributes.
 */
export function calculateAllMetrics(graph: Graph, verbose = false): NetworkMetrics {
  const N = graph.order;
  const E = graph.size;

  if (verbose) console.log(`  Calculating metrics for ${N} nodes, ${E} edges...`);

  // Degree metrics are direct from graph
  graph.forEachNode((node) => {
    graph.setNodeAttribute(node, 'degree', graph.degree(node));
    graph.setNodeAttribute(node, 'in_degree', graph.inDegree(node));
    graph.setNodeAttribute(node, 'out_degree', graph.outDegree(node));
  });

  // PageRank
  if (verbose) console.log('    PageRank...');
  const pageranks = calculatePageRank(graph);
  for (const [node, score] of pageranks) {
    graph.setNodeAttribute(node, 'pagerank', score);
  }

  // Betweenness (sample for large graphs)
  if (verbose) console.log('    Betweenness centrality...');
  const sampleSize = N > 1000 ? Math.min(200, N) : undefined;
  const betweennessScores = calculateBetweenness(graph, sampleSize);
  for (const [node, score] of betweennessScores) {
    graph.setNodeAttribute(node, 'betweenness', score);
  }

  // Closeness
  if (verbose) console.log('    Closeness centrality...');
  const closenessScores = calculateCloseness(graph);
  for (const [node, score] of closenessScores) {
    graph.setNodeAttribute(node, 'closeness', score);
  }

  // Clustering coefficient
  if (verbose) console.log('    Clustering coefficients...');
  const clusteringScores = calculateClustering(graph);
  for (const [node, score] of clusteringScores) {
    graph.setNodeAttribute(node, 'clustering', score);
  }

  // Network-level metrics
  const density = N > 1 ? E / (N * (N - 1)) : 0;

  return {
    density,
    modularity: 0, // Filled after community detection
    component_count: countComponents(graph),
    node_count: N,
    edge_count: E,
  };
}

/**
 * Count weakly connected components.
 */
function countComponents(graph: Graph): number {
  const visited = new Set<string>();
  let components = 0;

  graph.forEachNode((node) => {
    if (visited.has(node)) return;
    components++;
    const queue = [node];
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);
      graph.forEachNeighbor(current, (neighbor) => {
        if (!visited.has(neighbor)) queue.push(neighbor);
      });
    }
  });

  return components;
}

function shuffleArray<T>(arr: T[]): T[] {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

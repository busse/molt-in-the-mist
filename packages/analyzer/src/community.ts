import type Graph from 'graphology';

/**
 * Louvain community detection algorithm.
 * Returns a mapping of node -> community ID.
 */
export function detectCommunities(graph: Graph): Map<string, number> {
  const nodes = graph.nodes();
  const N = nodes.length;
  if (N === 0) return new Map();

  // Initialize: each node in its own community
  const nodeCommunity = new Map<string, number>();
  nodes.forEach((node, i) => nodeCommunity.set(node, i));

  // Pre-compute total edge weight
  let totalWeight = 0;
  graph.forEachEdge((_edge, attrs) => {
    totalWeight += (attrs.weight ?? 1);
  });

  if (totalWeight === 0) {
    return nodeCommunity;
  }

  const m2 = totalWeight * 2;

  // Compute weighted degree for each node
  const weightedDegree = new Map<string, number>();
  for (const node of nodes) {
    let wdeg = 0;
    graph.forEachEdge(node, (_edge, attrs) => {
      wdeg += (attrs.weight ?? 1);
    });
    weightedDegree.set(node, wdeg);
  }

  let improved = true;
  let iterations = 0;
  const maxIterations = 50;

  while (improved && iterations < maxIterations) {
    improved = false;
    iterations++;

    for (const node of nodes) {
      const currentCom = nodeCommunity.get(node)!;
      const ki = weightedDegree.get(node)!;

      // Compute community-level aggregates for neighbors
      const neighborCommunities = new Map<number, number>();

      graph.forEachEdge(node, (_edge, attrs, source, target) => {
        const neighbor = source === node ? target : source;
        const neighborCom = nodeCommunity.get(neighbor)!;
        const w = attrs.weight ?? 1;
        neighborCommunities.set(
          neighborCom,
          (neighborCommunities.get(neighborCom) ?? 0) + w,
        );
      });

      // Find the best community to move to
      let bestCom = currentCom;
      let bestDelta = 0;

      // Sum of weights inside current community connected to node
      const kiIn = neighborCommunities.get(currentCom) ?? 0;

      // Total weighted degree of current community
      const sigmaTotCurrent = getCommunityTotalDegree(nodeCommunity, weightedDegree, currentCom);

      for (const [com, kiInCom] of neighborCommunities) {
        if (com === currentCom) continue;

        const sigmaTotNew = getCommunityTotalDegree(nodeCommunity, weightedDegree, com);

        // Modularity gain of moving node from current to com
        const deltaQ =
          (kiInCom / m2 - (sigmaTotNew * ki) / (m2 * m2)) -
          (kiIn / m2 - ((sigmaTotCurrent - ki) * ki) / (m2 * m2));

        if (deltaQ > bestDelta) {
          bestDelta = deltaQ;
          bestCom = com;
        }
      }

      if (bestCom !== currentCom) {
        nodeCommunity.set(node, bestCom);
        improved = true;
      }
    }
  }

  // Renumber communities to be contiguous 0..K-1
  return renumberCommunities(nodeCommunity);
}

function getCommunityTotalDegree(
  nodeCommunity: Map<string, number>,
  weightedDegree: Map<string, number>,
  community: number,
): number {
  let total = 0;
  for (const [node, com] of nodeCommunity) {
    if (com === community) {
      total += weightedDegree.get(node) ?? 0;
    }
  }
  return total;
}

function renumberCommunities(communities: Map<string, number>): Map<string, number> {
  const mapping = new Map<number, number>();
  let nextId = 0;

  const result = new Map<string, number>();
  for (const [node, com] of communities) {
    if (!mapping.has(com)) {
      mapping.set(com, nextId++);
    }
    result.set(node, mapping.get(com)!);
  }
  return result;
}

/**
 * Calculate modularity score for the given community assignment.
 */
export function calculateModularity(graph: Graph, communities: Map<string, number>): number {
  let totalWeight = 0;
  graph.forEachEdge((_edge, attrs) => {
    totalWeight += (attrs.weight ?? 1);
  });

  if (totalWeight === 0) return 0;

  const m2 = totalWeight * 2;
  let Q = 0;

  graph.forEachEdge((_edge, attrs, source, target) => {
    if (communities.get(source) === communities.get(target)) {
      const w = attrs.weight ?? 1;
      let kiDeg = 0;
      graph.forEachEdge(source, (_, a) => { kiDeg += (a.weight ?? 1); });
      let kjDeg = 0;
      graph.forEachEdge(target, (_, a) => { kjDeg += (a.weight ?? 1); });
      Q += w - (kiDeg * kjDeg) / m2;
    }
  });

  return Q / m2;
}

/**
 * Build community summaries from detection results.
 */
export function buildCommunitySummaries(
  graph: Graph,
  communities: Map<string, number>,
  nameOverrides: Record<string, string> = {},
): Array<{ id: number; name?: string; size: number; top_agents: string[]; dominant_submolts: string[] }> {
  const communityNodes = new Map<number, string[]>();

  for (const [node, comId] of communities) {
    const list = communityNodes.get(comId) ?? [];
    list.push(node);
    communityNodes.set(comId, list);
  }

  const summaries: Array<{ id: number; name?: string; size: number; top_agents: string[]; dominant_submolts: string[] }> = [];

  for (const [comId, nodes] of communityNodes) {
    // Sort by pagerank to find top agents
    const sorted = nodes.sort((a, b) => {
      const prA = graph.getNodeAttribute(a, 'pagerank') ?? 0;
      const prB = graph.getNodeAttribute(b, 'pagerank') ?? 0;
      return prB - prA;
    });

    // Count submolt frequency
    const submoltCounts = new Map<string, number>();
    for (const node of nodes) {
      const subs: string[] = graph.getNodeAttribute(node, 'submolts') ?? [];
      for (const sub of subs) {
        submoltCounts.set(sub, (submoltCounts.get(sub) ?? 0) + 1);
      }
    }

    const dominantSubmolts = [...submoltCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name]) => name);

    const topAgents = sorted.slice(0, 10);
    const name = buildCommunityName(comId, dominantSubmolts, topAgents, nameOverrides);

    summaries.push({
      id: comId,
      name,
      size: nodes.length,
      top_agents: topAgents,
      dominant_submolts: dominantSubmolts,
    });
  }

  return summaries.sort((a, b) => b.size - a.size);
}

function buildCommunityName(
  communityId: number,
  dominantSubmolts: string[],
  topAgents: string[],
  overrides: Record<string, string>,
): string | undefined {
  const override = overrides[String(communityId)];
  if (override) return override;

  const submolts = dominantSubmolts.filter(Boolean).slice(0, 2);
  const topAgent = topAgents[0];

  if (submolts.length && topAgent) {
    return `${submolts.join(' · ')} — ${topAgent}`;
  }

  if (submolts.length) {
    return submolts.join(' · ');
  }

  if (topAgent) {
    return topAgent;
  }

  return `Community ${communityId}`;
}

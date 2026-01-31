import type Graph from 'graphology';
import type {
  VisualizationData,
  VisNode,
  VisLink,
  Community,
  InfluencerProfile,
  InfluenceWeights,
  NetworkMetrics,
  AnalyzerConfig,
} from './types.js';

/**
 * Export graph data for visualization, filtered by tier/influencer settings.
 */
export function exportVisualizationData(
  graph: Graph,
  influencerProfiles: InfluencerProfile[],
  communities: Community[],
  networkMetrics: NetworkMetrics,
  config: AnalyzerConfig,
  postCount: number,
  commentCount: number,
): VisualizationData {
  // Determine which nodes to include based on tier
  const includedNodes = selectNodes(graph, influencerProfiles, config);
  const includedNodeSet = new Set(includedNodes);

  // Build vis nodes
  const visNodes: VisNode[] = [];
  const profileMap = new Map(influencerProfiles.map(p => [p.agentName, p]));

  for (const nodeId of includedNodes) {
    const profile = profileMap.get(nodeId);
    const attrs = graph.getNodeAttributes(nodeId);

    visNodes.push({
      id: nodeId,
      label: attrs.label ?? nodeId,
      size: attrs.pagerank ? attrs.pagerank * 10000 : (attrs.degree ?? 1),
      community: attrs.community_id ?? 0,
      karma: attrs.karma ?? 0,
      posts: attrs.post_count ?? 0,
      comments: attrs.comment_count ?? 0,
      submolts: attrs.submolts ?? [],
      tier: profile?.tier ?? 'active',
      influenceScore: profile?.influenceScore ?? 0,
      influenceRank: profile?.rank ?? 0,
      metrics: {
        pagerank: attrs.pagerank ?? 0,
        betweenness: attrs.betweenness ?? 0,
        closeness: attrs.closeness ?? 0,
        eigenvector: attrs.eigenvector ?? 0,
        in_degree: attrs.in_degree ?? 0,
        out_degree: attrs.out_degree ?? 0,
        degree: attrs.degree ?? 0,
        clustering: attrs.clustering ?? 0,
      },
      topInteractions: profile?.topInteractions ?? { repliesTo: [], repliesFrom: [] },
    });
  }

  // Build vis links (only edges between included nodes)
  const visLinks: VisLink[] = [];
  graph.forEachEdge((_edge, attrs, source, target) => {
    if (includedNodeSet.has(source) && includedNodeSet.has(target)) {
      visLinks.push({
        source,
        target,
        weight: attrs.weight ?? 1,
      });
    }
  });

  // Tier assignments
  const elites = influencerProfiles
    .filter(p => p.tier === 'elite')
    .map(p => p.agentName);
  const majors = influencerProfiles
    .filter(p => p.tier === 'major')
    .map(p => p.agentName);
  const rising = influencerProfiles
    .filter(p => p.tier === 'rising')
    .map(p => p.agentName);

  const avgInfluence = influencerProfiles.length > 0
    ? influencerProfiles.reduce((sum, p) => sum + p.influenceScore, 0) / influencerProfiles.length
    : 0;

  return {
    nodes: visNodes,
    links: visLinks,
    metadata: {
      collected_at: new Date().toISOString(),
      total_posts: postCount,
      total_comments: commentCount,
      total_agents: graph.order,
      network_density: networkMetrics.density,
      community_count: communities.length,
      modularity: networkMetrics.modularity,
      influencer_count: influencerProfiles.filter(p => p.tier !== 'active').length,
      top_influencer: influencerProfiles[0]?.agentName ?? '',
      avg_influence_score: avgInfluence,
    },
    communities,
    influencers: {
      rankings: influencerProfiles.slice(0, config.influencerTop * 2),
      tiers: { elite: elites, major: majors, rising },
      weights: config.weights,
    },
  };
}

/**
 * Select which nodes to include based on tier and config.
 */
function selectNodes(
  graph: Graph,
  profiles: InfluencerProfile[],
  config: AnalyzerConfig,
): string[] {
  const profileMap = new Map(profiles.map(p => [p.agentName, p]));

  switch (config.tier) {
    case 'elite': {
      // Top N influencers
      const topNodes = profiles.slice(0, config.influencerTop).map(p => p.agentName);
      if (!config.includeConnections) return topNodes;
      return expandWithConnections(graph, topNodes);
    }
    case 'expanded': {
      // Top N + 1-hop connections
      const topNodes = profiles.slice(0, config.influencerTop).map(p => p.agentName);
      return expandWithConnections(graph, topNodes);
    }
    case 'community': {
      // Top 20 per community
      const communityTop = new Map<number, string[]>();
      for (const profile of profiles) {
        const comId = profile.metrics.communities[0] ?? 0;
        const list = communityTop.get(comId) ?? [];
        if (list.length < 20) {
          list.push(profile.agentName);
          communityTop.set(comId, list);
        }
      }
      return [...communityTop.values()].flat();
    }
    case 'custom': {
      return profiles
        .filter(p => p.influenceScore >= config.minInfluenceScore)
        .slice(0, config.influencerTop)
        .map(p => p.agentName);
    }
    default:
      return profiles.slice(0, config.influencerTop).map(p => p.agentName);
  }
}

/**
 * Expand a set of nodes to include their direct (1-hop) connections.
 */
function expandWithConnections(graph: Graph, coreNodes: string[]): string[] {
  const expanded = new Set(coreNodes);

  for (const node of coreNodes) {
    if (!graph.hasNode(node)) continue;
    graph.forEachNeighbor(node, (neighbor) => {
      expanded.add(neighbor);
    });
  }

  return [...expanded];
}

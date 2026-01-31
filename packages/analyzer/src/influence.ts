import type Graph from 'graphology';
import type { InfluenceWeights, InfluencerProfile } from './types.js';

export const DEFAULT_WEIGHTS: InfluenceWeights = {
  pagerank: 0.30,
  inDegree: 0.25,
  karma: 0.15,
  postCount: 0.10,
  replyRate: 0.10,
  betweenness: 0.10,
};

/**
 * Normalize a value using min-max scaling across all nodes for a given attribute.
 */
function buildNormalizer(
  graph: Graph,
  attribute: string,
): (value: number) => number {
  let min = Infinity;
  let max = -Infinity;

  graph.forEachNode((node) => {
    const val = graph.getNodeAttribute(node, attribute) ?? 0;
    if (val < min) min = val;
    if (val > max) max = val;
  });

  const range = max - min;
  if (range === 0) return () => 0;
  return (value: number) => (value - min) / range;
}

/**
 * Calculate influence scores for all nodes and return ranked profiles.
 */
export function calculateInfluenceScores(
  graph: Graph,
  weights: InfluenceWeights = DEFAULT_WEIGHTS,
): InfluencerProfile[] {
  const nodes = graph.nodes();
  if (nodes.length === 0) return [];

  // Build normalizers for each metric
  const normPagerank = buildNormalizer(graph, 'pagerank');
  const normInDegree = buildNormalizer(graph, 'in_degree');
  const normKarma = buildNormalizer(graph, 'karma');
  const normPostCount = buildNormalizer(graph, 'post_count');
  const normBetweenness = buildNormalizer(graph, 'betweenness');

  // Calculate reply rates
  const replyRates = new Map<string, number>();
  let maxReplyRate = 0;
  for (const node of nodes) {
    const commentCount = graph.getNodeAttribute(node, 'comment_count') ?? 0;
    const inDeg = graph.getNodeAttribute(node, 'in_degree') ?? 0;
    const rate = commentCount > 0 ? inDeg / commentCount : 0;
    replyRates.set(node, rate);
    if (rate > maxReplyRate) maxReplyRate = rate;
  }
  const normReplyRate = maxReplyRate > 0 ? (v: number) => v / maxReplyRate : () => 0;

  // Calculate composite scores
  const scores: Array<{ name: string; score: number }> = [];

  for (const node of nodes) {
    const pr = graph.getNodeAttribute(node, 'pagerank') ?? 0;
    const inDeg = graph.getNodeAttribute(node, 'in_degree') ?? 0;
    const karma = graph.getNodeAttribute(node, 'karma') ?? 0;
    const postCount = graph.getNodeAttribute(node, 'post_count') ?? 0;
    const betweenness = graph.getNodeAttribute(node, 'betweenness') ?? 0;
    const replyRate = replyRates.get(node) ?? 0;

    const score =
      weights.pagerank * normPagerank(pr) +
      weights.inDegree * normInDegree(inDeg) +
      weights.karma * normKarma(karma) +
      weights.postCount * normPostCount(postCount) +
      weights.replyRate * normReplyRate(replyRate) +
      weights.betweenness * normBetweenness(betweenness);

    scores.push({ name: node, score });
  }

  // Sort by score descending
  scores.sort((a, b) => b.score - a.score);

  // Build profiles with rankings
  const total = scores.length;
  const profiles: InfluencerProfile[] = scores.map((entry, index) => {
    const rank = index + 1;
    const node = entry.name;

    // Compute top interactions
    const repliesTo = new Map<string, number>();
    const repliesFrom = new Map<string, number>();

    graph.forEachOutEdge(node, (_edge, attrs, _source, target) => {
      repliesTo.set(target, (repliesTo.get(target) ?? 0) + (attrs.weight ?? 1));
    });

    graph.forEachInEdge(node, (_edge, attrs, source) => {
      repliesFrom.set(source, (repliesFrom.get(source) ?? 0) + (attrs.weight ?? 1));
    });

    const topRepliesTo = [...repliesTo.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name]) => name);

    const topRepliesFrom = [...repliesFrom.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name]) => name);

    // Get communities this agent is in
    const communityId = graph.getNodeAttribute(node, 'community_id') ?? 0;

    return {
      agentName: node,
      influenceScore: entry.score,
      rank,
      tier: assignTier(rank, total),
      metrics: {
        pagerank: graph.getNodeAttribute(node, 'pagerank') ?? 0,
        inDegree: graph.getNodeAttribute(node, 'in_degree') ?? 0,
        outDegree: graph.getNodeAttribute(node, 'out_degree') ?? 0,
        karma: graph.getNodeAttribute(node, 'karma') ?? 0,
        postCount: graph.getNodeAttribute(node, 'post_count') ?? 0,
        commentCount: graph.getNodeAttribute(node, 'comment_count') ?? 0,
        avgRepliesPerPost: 0,
        betweenness: graph.getNodeAttribute(node, 'betweenness') ?? 0,
        communities: [communityId],
      },
      topInteractions: {
        repliesTo: topRepliesTo,
        repliesFrom: topRepliesFrom,
      },
    };
  });

  return profiles;
}

function assignTier(rank: number, total: number): InfluencerProfile['tier'] {
  const percentile = rank / total;
  if (percentile <= 0.001 || rank <= 100) return 'elite';
  if (percentile <= 0.01 || rank <= 500) return 'major';
  if (percentile <= 0.05) return 'rising';
  return 'active';
}

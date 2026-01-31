import Graph from 'graphology';
import type { MoltbookPost, MoltbookComment, MoltbookAgent } from './types.js';

export function buildGraph(
  posts: MoltbookPost[],
  comments: MoltbookComment[],
  agents: MoltbookAgent[],
): Graph {
  const graph = new Graph({ type: 'directed', multi: false, allowSelfLoops: false });

  // Build a set of known agent names for validation
  const agentSet = new Set(agents.map(a => a.name));

  // Also add agents discovered from posts/comments
  for (const post of posts) {
    if (post.author?.name) agentSet.add(post.author.name);
  }
  for (const comment of comments) {
    if (comment.author?.name) agentSet.add(comment.author.name);
  }

  // Add nodes
  const agentMap = new Map(agents.map(a => [a.name, a]));
  for (const name of agentSet) {
    const agentData = agentMap.get(name);
    graph.addNode(name, {
      label: agentData?.display_name ?? name,
      karma: agentData?.karma ?? 0,
      post_count: agentData?.post_count ?? 0,
      comment_count: agentData?.comment_count ?? 0,
      submolts: [] as string[],
      first_seen: agentData?.created_at ?? '',
      last_seen: '',
    });
  }

  // Track submolt participation from posts
  const agentSubmolts = new Map<string, Set<string>>();
  for (const post of posts) {
    if (post.author?.name && post.submolt) {
      const subs = agentSubmolts.get(post.author.name) ?? new Set();
      subs.add(post.submolt);
      agentSubmolts.set(post.author.name, subs);
    }
  }

  // Also from comments via post_id -> post -> submolt
  const postMap = new Map(posts.map(p => [p.id, p]));
  for (const comment of comments) {
    const post = postMap.get(comment.post_id);
    if (comment.author?.name && post?.submolt) {
      const subs = agentSubmolts.get(comment.author.name) ?? new Set();
      subs.add(post.submolt);
      agentSubmolts.set(comment.author.name, subs);
    }
  }

  // Assign submolts to nodes
  for (const [name, subs] of agentSubmolts) {
    if (graph.hasNode(name)) {
      graph.setNodeAttribute(name, 'submolts', [...subs]);
    }
  }

  // Build edges from comment replies
  const commentMap = new Map(comments.map(c => [c.id, c]));

  // Track interaction counts for edge weighting
  const edgeCounts = new Map<string, { weight: number; types: Set<string>; posts: Set<string> }>();

  for (const comment of comments) {
    if (!comment.parent_id) continue;

    const parent = commentMap.get(comment.parent_id);
    if (!parent) continue;

    const source = comment.author?.name;
    const target = parent.author?.name;

    if (!source || !target || source === target) continue;
    if (!graph.hasNode(source) || !graph.hasNode(target)) continue;

    const edgeKey = `${source}->${target}`;
    const existing = edgeCounts.get(edgeKey);

    if (existing) {
      existing.weight++;
      existing.types.add('reply');
      if (comment.post_id) existing.posts.add(comment.post_id);
    } else {
      edgeCounts.set(edgeKey, {
        weight: 1,
        types: new Set(['reply']),
        posts: new Set(comment.post_id ? [comment.post_id] : []),
      });
    }
  }

  // Also create edges for top-level comment -> post author
  for (const comment of comments) {
    if (comment.parent_id) continue; // Only top-level

    const post = postMap.get(comment.post_id);
    if (!post) continue;

    const source = comment.author?.name;
    const target = post.author?.name;

    if (!source || !target || source === target) continue;
    if (!graph.hasNode(source) || !graph.hasNode(target)) continue;

    const edgeKey = `${source}->${target}`;
    const existing = edgeCounts.get(edgeKey);

    if (existing) {
      existing.weight++;
      existing.types.add('reply');
      if (comment.post_id) existing.posts.add(comment.post_id);
    } else {
      edgeCounts.set(edgeKey, {
        weight: 1,
        types: new Set(['reply']),
        posts: new Set(comment.post_id ? [comment.post_id] : []),
      });
    }
  }

  // Add edges to graph
  for (const [key, data] of edgeCounts) {
    const [source, target] = key.split('->');
    if (!graph.hasNode(source) || !graph.hasNode(target)) continue;

    try {
      graph.addEdge(source, target, {
        weight: data.weight,
        types: [...data.types],
        posts: [...data.posts],
      });
    } catch {
      // Edge already exists (shouldn't happen, but be safe)
      try {
        graph.updateEdgeAttribute(source, target, 'weight', (w: number) => (w ?? 0) + data.weight);
      } catch {
        // Ignore
      }
    }
  }

  return graph;
}

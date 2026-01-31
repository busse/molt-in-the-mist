import { Command } from 'commander';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildGraph } from './graph-builder.js';
import { calculateAllMetrics } from './metrics.js';
import { detectCommunities, calculateModularity, buildCommunitySummaries } from './community.js';
import { calculateInfluenceScores, DEFAULT_WEIGHTS } from './influence.js';
import { exportVisualizationData } from './export.js';
import type { MoltbookPost, MoltbookComment, MoltbookAgent, AnalyzerConfig } from './types.js';

const program = new Command();

program
  .name('molt-analyzer')
  .description('Analyze Moltbook social network data')
  .version('1.0.0');

program
  .command('analyze', { isDefault: true })
  .description('Run social network analysis on collected data')
  .option('-i, --input <dir>', 'Input data directory', '../../data')
  .option('-o, --output <dir>', 'Output directory for visualization data', '../site/public/data')
  .option('-t, --top <n>', 'Number of top influencers to include', '100')
  .option('--include-connections', 'Include 1-hop connections of top influencers', false)
  .option('--tier <tier>', 'Visualization tier: elite, expanded, community, custom', 'elite')
  .option('--min-score <n>', 'Minimum influence score (0-1) for custom tier', '0')
  .option('-v, --verbose', 'Enable verbose logging', false)
  .action(async (options) => {
    const config: AnalyzerConfig = {
      inputDir: path.resolve(options.input),
      outputDir: path.resolve(options.output),
      influencerTop: parseInt(options.top, 10),
      includeConnections: options.includeConnections || options.tier === 'expanded',
      tier: options.tier,
      minInfluenceScore: parseFloat(options.minScore),
      verbose: options.verbose,
      weights: { ...DEFAULT_WEIGHTS },
    };

    console.log('Molt-in-the-Mist Analyzer');
    console.log(`  Input:  ${config.inputDir}`);
    console.log(`  Output: ${config.outputDir}`);
    console.log(`  Tier:   ${config.tier}`);
    console.log(`  Top N:  ${config.influencerTop}`);
    console.log('');

    // Load data
    console.log('Loading collected data...');
    const { posts, comments, agents } = loadData(config.inputDir, config.verbose);
    const leaderboard = loadLeaderboard(config.inputDir, config.verbose);
    const mergedAgents = mergeAgentsWithLeaderboard(agents, leaderboard);

    console.log(`  Posts:    ${posts.length}`);
    console.log(`  Comments: ${comments.length}`);
    console.log(`  Agents:   ${mergedAgents.length}`);
    console.log('');

    // Build graph
    console.log('Building interaction graph...');
    const graph = buildGraph(posts, comments, mergedAgents);
    console.log(`  Nodes: ${graph.order}`);
    console.log(`  Edges: ${graph.size}`);
    console.log('');

    // Calculate metrics
    console.log('Calculating network metrics...');
    const networkMetrics = calculateAllMetrics(graph, config.verbose);
    console.log(`  Density: ${networkMetrics.density.toFixed(6)}`);
    console.log(`  Components: ${networkMetrics.component_count}`);
    console.log('');

    // Community detection
    console.log('Detecting communities...');
    const communityMap = detectCommunities(graph);
    for (const [node, comId] of communityMap) {
      graph.setNodeAttribute(node, 'community_id', comId);
    }
    const modularity = calculateModularity(graph, communityMap);
    networkMetrics.modularity = modularity;
    const communityNameOverrides = loadCommunityNameOverrides();
    const communities = buildCommunitySummaries(graph, communityMap, communityNameOverrides);
    console.log(`  Communities found: ${communities.length}`);
    console.log(`  Modularity: ${modularity.toFixed(4)}`);
    console.log('');

    // Calculate influence scores
    console.log('Calculating influence scores...');
    const influencerProfiles = calculateInfluenceScores(graph, config.weights);
    const eliteCount = influencerProfiles.filter(p => p.tier === 'elite').length;
    const majorCount = influencerProfiles.filter(p => p.tier === 'major').length;
    console.log(`  Elite influencers: ${eliteCount}`);
    console.log(`  Major influencers: ${majorCount}`);
    if (influencerProfiles.length > 0) {
      console.log(`  Top influencer: ${influencerProfiles[0].agentName} (score: ${influencerProfiles[0].influenceScore.toFixed(4)})`);
    }
    console.log('');

    // Export
    console.log('Exporting visualization data...');
    const visData = exportVisualizationData(
      graph,
      influencerProfiles,
      communities,
      networkMetrics,
      config,
      posts.length,
      comments.length,
    );

    fs.mkdirSync(config.outputDir, { recursive: true });
    const outputPath = path.join(config.outputDir, 'network.json');
    fs.writeFileSync(outputPath, JSON.stringify(visData, null, 2));
    console.log(`  Written to: ${outputPath}`);
    console.log(`  Nodes exported: ${visData.nodes.length}`);
    console.log(`  Links exported: ${visData.links.length}`);

    // Also export tier-specific files
    for (const tier of ['elite', 'expanded', 'community'] as const) {
      const tierConfig = { ...config, tier, includeConnections: tier === 'expanded' };
      const tierData = exportVisualizationData(
        graph, influencerProfiles, communities, networkMetrics,
        tierConfig, posts.length, comments.length,
      );
      const tierPath = path.join(config.outputDir, `${tier}.json`);
      fs.writeFileSync(tierPath, JSON.stringify(tierData, null, 2));
      console.log(`  ${tier}.json: ${tierData.nodes.length} nodes, ${tierData.links.length} links`);
    }

    // Export entity indexes for SPA lists/details
    const agentsIndex = buildAgentIndex(mergedAgents, influencerProfiles);
    const postsIndex = buildPostIndex(posts);
    writeJson(path.join(config.outputDir, 'agents.json'), agentsIndex);
    writeJson(path.join(config.outputDir, 'posts.json'), postsIndex);
    console.log(`  agents.json: ${agentsIndex.length} agents`);
    console.log(`  posts.json: ${postsIndex.length} posts`);

    console.log('\nAnalysis complete.');
  });

function loadData(inputDir: string, verbose: boolean): {
  posts: MoltbookPost[];
  comments: MoltbookComment[];
  agents: MoltbookAgent[];
} {
  const posts: MoltbookPost[] = [];
  const comments: MoltbookComment[] = [];
  const agents: MoltbookAgent[] = [];

  // Load posts
  const postsDir = path.join(inputDir, 'posts');
  if (fs.existsSync(postsDir)) {
    const postFiles = fs.readdirSync(postsDir).filter(f => f.endsWith('.json'));
    for (const file of postFiles) {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(postsDir, file), 'utf-8'));
        posts.push(data);
      } catch (err) {
        if (verbose) console.error(`  Error loading post ${file}:`, (err as Error).message);
      }
    }
  }

  // Load comments
  const commentsDir = path.join(inputDir, 'comments');
  if (fs.existsSync(commentsDir)) {
    const commentFiles = fs.readdirSync(commentsDir).filter(f => f.endsWith('.json'));
    for (const file of commentFiles) {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(commentsDir, file), 'utf-8'));
        if (Array.isArray(data)) {
          comments.push(...data);
        } else {
          comments.push(data);
        }
      } catch (err) {
        if (verbose) console.error(`  Error loading comments ${file}:`, (err as Error).message);
      }
    }
  }

  // Load agents
  const agentsDir = path.join(inputDir, 'agents');
  if (fs.existsSync(agentsDir)) {
    const agentFiles = fs.readdirSync(agentsDir).filter(f => f.endsWith('.json'));
    for (const file of agentFiles) {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(agentsDir, file), 'utf-8'));
        agents.push(data);
      } catch (err) {
        if (verbose) console.error(`  Error loading agent ${file}:`, (err as Error).message);
      }
    }
  }

  return { posts, comments, agents };
}

function loadLeaderboard(
  inputDir: string,
  verbose: boolean,
): Array<{ name: string; karma: number; rank: number }> {
  const leaderboardPath = path.join(inputDir, 'moltbook-leaderboard.json');
  if (!fs.existsSync(leaderboardPath)) return [];

  try {
    const data = JSON.parse(fs.readFileSync(leaderboardPath, 'utf-8'));
    if (!Array.isArray(data)) return [];
    return data
      .filter(entry => entry?.name)
      .map(entry => ({
        name: String(entry.name),
        karma: Number(entry.karma ?? 0),
        rank: Number(entry.rank ?? 0),
      }))
      .filter(entry => entry.name && entry.rank > 0);
  } catch (err) {
    if (verbose) {
      console.warn(`  Error loading moltbook leaderboard: ${(err as Error).message}`);
    }
    return [];
  }
}

function mergeAgentsWithLeaderboard(
  agents: MoltbookAgent[],
  leaderboard: Array<{ name: string; karma: number; rank: number }>,
): MoltbookAgent[] {
  const agentMap = new Map(agents.map(agent => [agent.name, { ...agent }]));

  for (const entry of leaderboard) {
    const existing = agentMap.get(entry.name);
    if (existing) {
      existing.karma = Math.max(existing.karma ?? 0, entry.karma ?? 0);
      existing.moltbookRank = entry.rank;
      agentMap.set(entry.name, existing);
    } else {
      agentMap.set(entry.name, {
        name: entry.name,
        display_name: entry.name,
        created_at: '',
        karma: entry.karma ?? 0,
        post_count: 0,
        comment_count: 0,
        moltbookRank: entry.rank,
      });
    }
  }

  return [...agentMap.values()];
}

program.parse();

function loadCommunityNameOverrides(): Record<string, string> {
  const overrides: Record<string, string> = {};
  const currentFile = fileURLToPath(import.meta.url);
  const currentDir = path.dirname(currentFile);
  const overridesPath = path.join(currentDir, '../config/community-names.json');

  if (!fs.existsSync(overridesPath)) return overrides;

  try {
    const raw = JSON.parse(fs.readFileSync(overridesPath, 'utf-8'));
    if (!raw || typeof raw !== 'object') return overrides;

    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof value === 'string' && value.trim()) {
        overrides[key] = value.trim();
      }
    }
  } catch (err) {
    console.warn(`Warning: failed to load community name overrides: ${(err as Error).message}`);
  }

  return overrides;
}

function writeJson(filePath: string, data: unknown): void {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function buildAgentIndex(
  agents: MoltbookAgent[],
  profiles: Array<{ agentName: string; influenceScore: number; rank: number; tier: string; metrics?: { communities?: number[] } }>,
): Array<{
  id: string;
  name: string;
  display_name: string;
  created_at: string;
  karma: number;
  post_count: number;
  comment_count: number;
  moltbookRank?: number;
  influenceScore?: number;
  influenceRank?: number;
  tier?: string;
  communities?: number[];
}> {
  const profileMap = new Map(profiles.map(profile => [profile.agentName, profile]));

  return agents.map(agent => {
    const profile = profileMap.get(agent.name);
    return {
      id: agent.name,
      name: agent.name,
      display_name: agent.display_name,
      created_at: agent.created_at,
      karma: agent.karma,
      post_count: agent.post_count,
      comment_count: agent.comment_count,
      moltbookRank: agent.moltbookRank,
      influenceScore: profile?.influenceScore,
      influenceRank: profile?.rank,
      tier: profile?.tier,
      communities: profile?.metrics?.communities,
    };
  });
}

function buildPostIndex(posts: MoltbookPost[]): Array<{
  id: string;
  title: string;
  content: string;
  created_at: string;
  author: { name: string; display_name?: string } | null;
  submolt?: string;
  comment_count: number;
  score?: number;
  upvotes?: number;
  downvotes?: number;
  url?: string | null;
}> {
  return posts.map(post => ({
    id: post.id,
    title: post.title ?? '',
    content: post.content ?? '',
    created_at: post.created_at,
    author: post.author ? { name: post.author.name, display_name: post.author.display_name } : null,
    submolt: post.submolt,
    comment_count: post.comment_count ?? 0,
    score: post.score,
    upvotes: (post as MoltbookPost & { upvotes?: number }).upvotes,
    downvotes: (post as MoltbookPost & { downvotes?: number }).downvotes,
    url: (post as MoltbookPost & { url?: string | null }).url ?? null,
  }));
}

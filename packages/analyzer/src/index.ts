import { Command } from 'commander';
import * as fs from 'node:fs';
import * as path from 'node:path';
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

    console.log(`  Posts:    ${posts.length}`);
    console.log(`  Comments: ${comments.length}`);
    console.log(`  Agents:   ${agents.length}`);
    console.log('');

    // Build graph
    console.log('Building interaction graph...');
    const graph = buildGraph(posts, comments, agents);
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
    const communities = buildCommunitySummaries(graph, communityMap);
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

program.parse();

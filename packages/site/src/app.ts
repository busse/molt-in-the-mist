import { ForceGraph } from './force-graph.js';
import { Tooltip } from './tooltip.js';
import { Controls, showAgentDetails } from './controls.js';
import type { VisualizationData } from './types.js';

async function main(): Promise<void> {
  const statusEl = document.getElementById('loading-status');

  try {
    if (statusEl) statusEl.textContent = 'Loading network data...';

    // Try to load the network data
    const dataUrl = `${import.meta.env.BASE_URL}data/network.json`;
    let data: VisualizationData;

    try {
      const response = await fetch(dataUrl);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      data = await response.json();
    } catch {
      // Fall back to demo data if real data not available
      console.warn('No network data found, using demo data');
      data = generateDemoData();
    }

    if (statusEl) statusEl.textContent = `Rendering ${data.nodes.length} nodes...`;

    // Initialize force graph
    const graph = new ForceGraph('#graph', data, {
      chargeStrength: -120,
      linkDistance: 60,
    });

    // Initialize tooltip
    const tooltip = new Tooltip();
    graph.setNodeHoverHandler((node, event) => {
      if (node) {
        tooltip.show(node, event);
      } else {
        tooltip.hide();
      }
    });

    // Click to show details
    graph.setNodeClickHandler((node) => {
      graph.highlightEgoNetwork(node.id);
      showAgentDetails(node);
    });

    // Initialize controls
    const controls = new Controls(graph, data);
    controls.setSpotlightHandler((agentId) => {
      const node = graph.getNodes().find(n => n.id === agentId);
      if (node) showAgentDetails(node);
    });

    // Hide loading
    const loadingEl = document.getElementById('loading');
    if (loadingEl) loadingEl.classList.add('hidden');

  } catch (err) {
    console.error('Failed to initialize:', err);
    if (statusEl) statusEl.textContent = `Error: ${(err as Error).message}`;
  }
}

/**
 * Generate demo data for when no real data is available.
 */
function generateDemoData(): VisualizationData {
  const communities = 6;
  const nodesPerCommunity = 20;
  const nodes: VisualizationData['nodes'] = [];
  const links: VisualizationData['links'] = [];

  const agentNames = [
    'CrustBot3000', 'ShellMind', 'MoltMaster', 'CarapaceAI', 'ExoAgent',
    'ChitinChatter', 'PinchBot', 'ClawLogic', 'TidePool_AI', 'ReefKeeper',
    'AntennaeBot', 'BurrowerAI', 'SurfaceWalker', 'DeepDiver', 'CoralNexus',
    'KelpForest', 'SandSifter', 'WaveRider', 'CurrentFlow', 'MoonTide',
    'BarnacleBot', 'SpongeLogic', 'JellyMind', 'StarfishAI', 'UrchinNet',
    'ClamShell', 'OysterPearl', 'LobsterAI', 'ShrimpNet', 'CrabWalk',
    'PlanktonBot', 'SquidInk', 'OctopusAI', 'NautilusNet', 'SeaHorseBot',
    'MangroveAI', 'LagoonMind', 'AtollBot', 'TsunamiAI', 'WhirlpoolNet',
    'AbaloneBot', 'ConchAI', 'WhelkMind', 'PeriwinkleNet', 'LimpetBot',
    'MusselsAI', 'ScallopNet', 'CowrieBot', 'TritonAI', 'NereidMind',
    'DolphinAI', 'WhaleBot', 'SealMind', 'WalrusNet', 'OtterAI',
    'PelicanBot', 'AlbatrossAI', 'PenguinNet', 'PuffinMind', 'GullBot',
    'AnemoneAI', 'CoralBot', 'TunicateNet', 'BryozoanAI', 'HydroidMind',
    'PolypBot', 'MedusaAI', 'SiphonNet', 'TentacleBot', 'CnidariaMind',
    'DiatomAI', 'ForamBot', 'RadiolarianNet', 'CoccolithAI', 'DinoflagMind',
    'AlgaeBot', 'PhytoAI', 'ZooplanktonNet', 'CopepodBot', 'KrillMind',
    'AmphipodAI', 'IsopodBot', 'MysidNet', 'EuphausidAI', 'DecapodMind',
    'StomatopodBot', 'RemipediaAI', 'CephalocaridNet', 'BranchiopodBot', 'OstracodMind',
    'CircipedeAI', 'ThecostrBot', 'RhizocephNet', 'AcrothorAI', 'TantulMind',
    'PentastomidBot', 'BranchiuraAI', 'CopepodNet', 'MystacocarBot', 'ThermosbaenMind',
    'SpelaeoBot', 'AnaspidAI', 'BathynellaNet', 'StygocarBot', 'IngusMind',
    'MictocariBot', 'PancaridaAI', 'CumaceaNet', 'TanaidaceaBot', 'ThermaMind',
    'LophogastrBot', 'GnathophaAI', 'BopyridaeNet', 'CymothoBot', 'AegidaeMind',
    'CorallimorAI', 'ZoanthidBot', 'ActiniarNet', 'CerianthAI', 'AntipathMind',
    'GorgonianBot', 'PennatulAI', 'HelioporNet', 'TubiporeBot', 'StolonMind',
  ];

  for (let c = 0; c < communities; c++) {
    for (let i = 0; i < nodesPerCommunity; i++) {
      const idx = c * nodesPerCommunity + i;
      const name = agentNames[idx] ?? `Agent_${idx}`;
      const isInfluencer = i < 3;
      const karma = isInfluencer
        ? Math.floor(Math.random() * 5000) + 2000
        : Math.floor(Math.random() * 500) + 10;

      nodes.push({
        id: name,
        label: name,
        size: isInfluencer ? 30 + Math.random() * 40 : 1 + Math.random() * 15,
        community: c,
        karma,
        posts: Math.floor(Math.random() * (isInfluencer ? 50 : 10)),
        comments: Math.floor(Math.random() * (isInfluencer ? 200 : 30)),
        submolts: [`community_${c}`],
        tier: i === 0 ? 'elite' : i < 3 ? 'major' : i < 6 ? 'rising' : 'active',
        influenceScore: isInfluencer ? 0.5 + Math.random() * 0.5 : Math.random() * 0.3,
        influenceRank: idx + 1,
        metrics: {
          pagerank: isInfluencer ? 0.01 + Math.random() * 0.05 : Math.random() * 0.005,
          betweenness: Math.random() * 0.1,
          closeness: Math.random(),
          eigenvector: Math.random(),
          in_degree: Math.floor(Math.random() * (isInfluencer ? 30 : 8)),
          out_degree: Math.floor(Math.random() * (isInfluencer ? 20 : 5)),
          degree: 0,
          clustering: Math.random(),
        },
        topInteractions: {
          repliesTo: [],
          repliesFrom: [],
        },
      });
    }
  }

  // Fix degree
  nodes.forEach(n => {
    n.metrics.degree = n.metrics.in_degree + n.metrics.out_degree;
  });

  // Create intra-community links
  for (let c = 0; c < communities; c++) {
    const comNodes = nodes.filter(n => n.community === c);
    for (let i = 0; i < comNodes.length; i++) {
      for (let j = i + 1; j < comNodes.length; j++) {
        if (Math.random() < 0.3) {
          links.push({
            source: comNodes[i].id,
            target: comNodes[j].id,
            weight: Math.floor(Math.random() * 5) + 1,
          });
        }
      }
    }
  }

  // Create inter-community links (bridges)
  for (let c = 0; c < communities; c++) {
    const comA = nodes.filter(n => n.community === c);
    const comB = nodes.filter(n => n.community === ((c + 1) % communities));
    for (let i = 0; i < 3; i++) {
      const a = comA[Math.floor(Math.random() * comA.length)];
      const b = comB[Math.floor(Math.random() * comB.length)];
      links.push({
        source: a.id,
        target: b.id,
        weight: Math.floor(Math.random() * 3) + 1,
      });
    }
  }

  // Build rankings from nodes
  const rankings = [...nodes]
    .sort((a, b) => b.influenceScore - a.influenceScore)
    .map((n, i) => ({
      agentName: n.id,
      influenceScore: n.influenceScore,
      rank: i + 1,
      tier: n.tier as 'elite' | 'major' | 'rising' | 'active',
      metrics: {
        pagerank: n.metrics.pagerank,
        inDegree: n.metrics.in_degree,
        outDegree: n.metrics.out_degree,
        karma: n.karma,
        postCount: n.posts,
        commentCount: n.comments,
        avgRepliesPerPost: 0,
        betweenness: n.metrics.betweenness,
        communities: [n.community],
      },
      topInteractions: n.topInteractions,
    }));

  return {
    nodes,
    links,
    metadata: {
      collected_at: new Date().toISOString(),
      total_posts: 500,
      total_comments: 2500,
      total_agents: nodes.length,
      network_density: (2 * links.length) / (nodes.length * (nodes.length - 1)),
      community_count: communities,
      modularity: 0.42,
      influencer_count: nodes.filter(n => n.tier !== 'active').length,
      top_influencer: rankings[0]?.agentName ?? '',
      avg_influence_score: rankings.reduce((s, r) => s + r.influenceScore, 0) / rankings.length,
    },
    communities: Array.from({ length: communities }, (_, i) => ({
      id: i,
      size: nodesPerCommunity,
      top_agents: nodes.filter(n => n.community === i).slice(0, 3).map(n => n.id),
      dominant_submolts: [`community_${i}`],
    })),
    influencers: {
      rankings,
      tiers: {
        elite: rankings.filter(r => r.tier === 'elite').map(r => r.agentName),
        major: rankings.filter(r => r.tier === 'major').map(r => r.agentName),
        rising: rankings.filter(r => r.tier === 'rising').map(r => r.agentName),
      },
      weights: {
        pagerank: 0.30,
        inDegree: 0.25,
        karma: 0.15,
        postCount: 0.10,
        replyRate: 0.10,
        betweenness: 0.10,
      },
    },
  };
}

// Start
document.addEventListener('DOMContentLoaded', main);

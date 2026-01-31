export interface VisNode extends d3.SimulationNodeDatum {
  id: string;
  label: string;
  size: number;
  community: number;
  karma: number;
  posts: number;
  comments: number;
  submolts: string[];
  tier: string;
  influenceScore: number;
  influenceRank: number;
  metrics: {
    pagerank: number;
    betweenness: number;
    closeness: number;
    eigenvector: number;
    in_degree: number;
    out_degree: number;
    degree: number;
    clustering: number;
  };
  topInteractions: {
    repliesTo: string[];
    repliesFrom: string[];
  };
}

export interface VisLink extends d3.SimulationLinkDatum<VisNode> {
  source: string | VisNode;
  target: string | VisNode;
  weight: number;
}

export interface Community {
  id: number;
  size: number;
  top_agents: string[];
  dominant_submolts: string[];
}

export interface InfluenceWeights {
  pagerank: number;
  inDegree: number;
  karma: number;
  postCount: number;
  replyRate: number;
  betweenness: number;
}

export interface InfluencerProfile {
  agentName: string;
  influenceScore: number;
  rank: number;
  tier: 'elite' | 'major' | 'rising' | 'active';
  metrics: {
    pagerank: number;
    inDegree: number;
    outDegree: number;
    karma: number;
    postCount: number;
    commentCount: number;
    avgRepliesPerPost: number;
    betweenness: number;
    communities: number[];
  };
  topInteractions: {
    repliesTo: string[];
    repliesFrom: string[];
  };
}

export interface VisualizationData {
  nodes: VisNode[];
  links: VisLink[];
  metadata: {
    collected_at: string;
    total_posts: number;
    total_comments: number;
    total_agents: number;
    network_density: number;
    community_count: number;
    modularity: number;
    influencer_count: number;
    top_influencer: string;
    avg_influence_score: number;
  };
  communities: Community[];
  influencers: {
    rankings: InfluencerProfile[];
    tiers: {
      elite: string[];
      major: string[];
      rising: string[];
    };
    weights: InfluenceWeights;
  };
}

export interface FilterState {
  minDegree: number;
  communities: Set<number>;
  submolts: Set<string>;
  searchQuery: string;
  tier: 'elite' | 'major' | 'expanded' | 'custom';
  topN: number;
  minInfluenceScore: number;
  includeConnections: boolean;
  spotlightAgent: string | null;
}

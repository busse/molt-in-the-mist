export interface MoltbookPost {
  id: string;
  title: string;
  content: string;
  author: AgentRef | null;
  submolt: string;
  created_at: string;
  score: number;
  comment_count: number;
}

export interface MoltbookComment {
  id: string;
  post_id: string;
  parent_id: string | null;
  author: AgentRef | null;
  content: string;
  created_at: string;
  score: number;
}

export interface AgentRef {
  name: string;
  display_name?: string;
}

export interface MoltbookAgent {
  name: string;
  display_name: string;
  bio?: string;
  created_at: string;
  karma: number;
  post_count: number;
  comment_count: number;
  moltbookRank?: number;
}

export interface NodeData {
  id: string;
  label: string;
  karma: number;
  moltbookRank?: number;
  post_count: number;
  comment_count: number;
  submolts: string[];
  first_seen: string;
  last_seen: string;
  degree: number;
  in_degree: number;
  out_degree: number;
  betweenness: number;
  closeness: number;
  eigenvector: number;
  pagerank: number;
  clustering: number;
  community_id: number;
}

export interface EdgeData {
  source: string;
  target: string;
  weight: number;
  types: string[];
}

export interface NetworkMetrics {
  density: number;
  modularity: number;
  component_count: number;
  node_count: number;
  edge_count: number;
}

export interface Community {
  id: number;
  name?: string;
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

export interface VisNode {
  id: string;
  label: string;
  size: number;
  community: number;
  karma: number;
  moltbookRank?: number;
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

export interface VisLink {
  source: string;
  target: string;
  weight: number;
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

export interface AnalyzerConfig {
  inputDir: string;
  outputDir: string;
  influencerTop: number;
  includeConnections: boolean;
  tier: 'elite' | 'expanded' | 'community' | 'custom';
  minInfluenceScore: number;
  verbose: boolean;
  weights: InfluenceWeights;
}

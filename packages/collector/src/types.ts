export interface MoltbookPost {
  id: string;
  title: string;
  content: string;
  author: AgentRef;
  submolt: string;
  created_at: string;
  score: number;
  comment_count: number;
}

export interface MoltbookComment {
  id: string;
  post_id: string;
  parent_id: string | null;
  author: AgentRef;
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
}

export interface Interaction {
  source: string;
  target: string;
  type: 'reply' | 'same_thread' | 'same_submolt';
  weight: number;
  posts: string[];
  first_interaction: string;
  last_interaction: string;
}

export interface CollectorConfig {
  outputDir: string;
  apiKey?: string;
  mode: 'full' | 'influencer-first';
  influencerThreshold: number;
  submolts?: string[];
  since?: string;
  verbose: boolean;
  sortOrders: Array<'hot' | 'new' | 'top' | 'rising'>;
  maxPages: number;
  pageSize: number;
}

export interface CollectorState {
  lastRun?: string;
  postsCollected: number;
  commentsCollected: number;
  agentsCollected: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  total?: number;
  offset: number;
  limit: number;
  has_more?: boolean;
}

export interface AgentRecord {
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
}

export interface PostRecord {
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
}

export interface EntityData {
  agents: AgentRecord[];
  posts: PostRecord[];
  agentsById: Map<string, AgentRecord>;
  postsById: Map<string, PostRecord>;
  postsByAuthor: Map<string, PostRecord[]>;
}

const BASE_URL = import.meta.env.BASE_URL ?? '/';

async function fetchJson<T>(path: string): Promise<T | null> {
  try {
    const response = await fetch(`${BASE_URL}data/${path}`);
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

function buildPostsByAuthor(posts: PostRecord[]): Map<string, PostRecord[]> {
  const map = new Map<string, PostRecord[]>();
  for (const post of posts) {
    const authorName = post.author?.name;
    if (!authorName) continue;
    const list = map.get(authorName) ?? [];
    list.push(post);
    map.set(authorName, list);
  }
  return map;
}

export async function loadEntityData(): Promise<EntityData> {
  const agents = (await fetchJson<AgentRecord[]>('agents.json')) ?? [];
  const posts = (await fetchJson<PostRecord[]>('posts.json')) ?? [];

  const agentsById = new Map(agents.map(agent => [agent.id, agent]));
  const postsById = new Map(posts.map(post => [post.id, post]));
  const postsByAuthor = buildPostsByAuthor(posts);

  return { agents, posts, agentsById, postsById, postsByAuthor };
}

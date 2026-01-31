import { TokenBucketRateLimiter } from './rate-limiter.js';
import type {
  MoltbookPost,
  MoltbookComment,
  MoltbookAgent,
  PaginatedResponse,
} from './types.js';

const BASE_URL = 'https://www.moltbook.com/api/v1';

export class MoltbookApiClient {
  private rateLimiter: TokenBucketRateLimiter;
  private apiKey?: string;
  private verbose: boolean;

  constructor(options: { apiKey?: string; verbose?: boolean } = {}) {
    this.rateLimiter = new TokenBucketRateLimiter(90, 90, 60_000);
    this.apiKey = options.apiKey;
    this.verbose = options.verbose ?? false;
  }

  private async request<T>(path: string, params?: Record<string, string | number>): Promise<T> {
    await this.rateLimiter.acquire();

    const url = new URL(`${BASE_URL}${path}`);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null && value !== '') {
          url.searchParams.set(key, String(value));
        }
      }
    }

    const headers: Record<string, string> = {
      'Accept': 'application/json',
    };
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    if (this.verbose) {
      console.log(`  GET ${url.pathname}${url.search}`);
    }

    const response = await fetch(url.toString(), { headers });

    if (!response.ok) {
      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After');
        const waitMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : 60_000;
        console.warn(`Rate limited. Waiting ${waitMs / 1000}s...`);
        await new Promise(resolve => setTimeout(resolve, waitMs));
        return this.request<T>(path, params);
      }
      throw new Error(`API request failed: ${response.status} ${response.statusText} for ${url.pathname}`);
    }

    return response.json() as Promise<T>;
  }

  async getPosts(options: {
    sort?: 'hot' | 'new' | 'top' | 'rising';
    submolt?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<MoltbookPost[]> {
    const params: Record<string, string | number> = {};
    if (options.sort) params.sort = options.sort;
    if (options.submolt) params.submolt = options.submolt;
    if (options.limit) params.limit = options.limit;
    if (options.offset !== undefined) params.offset = options.offset;

    const result = await this.request<MoltbookPost[] | PaginatedResponse<MoltbookPost>>('/posts', params);
    return Array.isArray(result) ? result : result.data;
  }

  async getPost(id: string): Promise<MoltbookPost & { comments?: MoltbookComment[] }> {
    return this.request(`/posts/${id}`);
  }

  async getAgent(name: string): Promise<MoltbookAgent> {
    return this.request(`/agents/${name}`);
  }

  async getComments(options: {
    post_id?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<MoltbookComment[]> {
    const params: Record<string, string | number> = {};
    if (options.post_id) params.post_id = options.post_id;
    if (options.limit) params.limit = options.limit;
    if (options.offset !== undefined) params.offset = options.offset;

    const result = await this.request<MoltbookComment[] | PaginatedResponse<MoltbookComment>>('/comments', params);
    return Array.isArray(result) ? result : result.data;
  }

  async getSubmolts(): Promise<Array<{ name: string; description?: string; member_count?: number }>> {
    const result = await this.request<Array<{ name: string; description?: string; member_count?: number }>>('/submolts');
    return Array.isArray(result) ? result : [];
  }

  async search(query: string, type?: 'posts' | 'agents' | 'submolts'): Promise<unknown> {
    const params: Record<string, string | number> = { q: query };
    if (type) params.type = type;
    return this.request('/search', params);
  }

  get rateLimitRemaining(): number {
    return this.rateLimiter.remaining;
  }
}

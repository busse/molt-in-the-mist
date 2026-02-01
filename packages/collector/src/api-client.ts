import * as cheerio from 'cheerio';
import type { Browser, Page } from 'playwright';
import { TokenBucketRateLimiter } from './rate-limiter.js';
import type {
  MoltbookPost,
  MoltbookComment,
  MoltbookAgent,
  PaginatedResponse,
  RegisterRequest,
  RegisterResponse,
} from './types.js';

const BASE_URL = 'https://www.moltbook.com/api/v1';
const BASE_SITE_URL = 'https://www.moltbook.com';

export class MoltbookApiClient {
  private rateLimiter: TokenBucketRateLimiter;
  private apiKey?: string;
  private verbose: boolean;
  private playwrightBrowser?: Browser;

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

  private async requestHtml(path: string): Promise<string> {
    await this.rateLimiter.acquire();
    const url = new URL(path, BASE_SITE_URL);

    if (this.verbose) {
      console.log(`  GET ${url.pathname}${url.search} (html)`);
    }

    const response = await fetch(url.toString(), {
      headers: {
        'Accept': 'text/html',
        'Accept-Language': 'en-US,en;q=0.9',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });

    if (!response.ok) {
      throw new Error(`HTML request failed: ${response.status} ${response.statusText} for ${url.pathname}`);
    }

    return response.text();
  }

  private async getPlaywrightBrowser(): Promise<Browser> {
    if (this.playwrightBrowser) return this.playwrightBrowser;
    const { chromium } = await import('playwright');
    this.playwrightBrowser = await chromium.launch({ headless: true });
    return this.playwrightBrowser;
  }

  private async withPlaywrightPage<T>(fn: (page: Page) => Promise<T>): Promise<T> {
    const browser = await this.getPlaywrightBrowser();
    const page = await browser.newPage({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      locale: 'en-US',
    });
    try {
      return await fn(page);
    } finally {
      await page.close();
    }
  }

  private parseNumber(value: string): number {
    const cleaned = value.replace(/[^0-9]/g, '');
    return cleaned ? parseInt(cleaned, 10) : 0;
  }

  private extractAuthorName(value: unknown): string | undefined {
    if (!value) return undefined;
    if (typeof value === 'string') return value.trim() || undefined;
    if (typeof value !== 'object') return undefined;

    const record = value as Record<string, unknown>;
    const candidates = [
      record.name,
      record.username,
      record.handle,
      record.author,
      record.author_name,
      record.authorName,
      record.display_name,
      record.displayName,
    ];

    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.trim()) {
        return candidate.trim();
      }
    }
    return undefined;
  }

  private extractAuthorsFromNextData(nextData: unknown, postId: string): {
    postAuthor?: string;
    commentAuthors: Map<string, string>;
  } | null {
    if (!nextData || typeof nextData !== 'object') return null;

    const commentAuthors = new Map<string, string>();
    let postAuthor: string | undefined;

    const visit = (node: unknown) => {
      if (!node) return;
      if (Array.isArray(node)) {
        for (const item of node) visit(item);
        return;
      }
      if (typeof node !== 'object') return;

      const record = node as Record<string, unknown>;
      const nodeId = typeof record.id === 'string' ? record.id : undefined;
      const nodePostId =
        typeof record.post_id === 'string'
          ? record.post_id
          : typeof record.postId === 'string'
            ? record.postId
            : undefined;
      const content = record.content ?? record.body ?? record.text;

      if (nodeId === postId && (record.title || record.content)) {
        const authorName = this.extractAuthorName(
          record.author ??
            record.author_name ??
            record.authorName ??
            record.user ??
            record.agent ??
            record.creator,
        );
        if (authorName && !postAuthor) {
          postAuthor = authorName;
        }
      }

      if (nodeId && nodePostId === postId && (content || record.created_at || record.createdAt)) {
        const authorName = this.extractAuthorName(
          record.author ?? record.author_name ?? record.authorName ?? record.user ?? record.agent,
        );
        if (authorName) {
          commentAuthors.set(nodeId, authorName);
        }
      }

      for (const value of Object.values(record)) {
        visit(value);
      }
    };

    visit(nextData);

    if (!postAuthor && commentAuthors.size === 0) return null;
    return { postAuthor, commentAuthors };
  }

  private parseTopAgentsFromHtml(html: string): Array<{ name: string; karma: number; rank: number }> {
    const $ = cheerio.load(html);
    const entries: Array<{ name: string; karma: number; rank: number }> = [];

    const sections = $('section, aside, div');
    const matches: cheerio.Cheerio = sections.filter((_idx, el) => {
      const text = $(el).text().toLowerCase();
      return text.includes('top ai agents') || text.includes('top agents');
    });

    const candidates = matches.length
      ? matches.first().find('a[href^="/u/"]').toArray()
      : $('a[href^="/u/"]').toArray();

    for (const row of candidates) {
      const link = $(row);
      const href = link.attr('href') ?? '';
      const name = href.replace('/u/', '').trim();
      const linkText = link.text().trim();
      const text = linkText || link.parent().text().trim();

      if (!name || !text.toLowerCase().includes('karma')) continue;

      const rankMatch = text.match(/^\s*(\d{1,3})\b/);
      const rank = rankMatch ? parseInt(rankMatch[1], 10) : entries.length + 1;

      const karmaMatch = text.match(/([\d,]+)\s*karma/i);
      const karma = karmaMatch ? this.parseNumber(karmaMatch[1]) : 0;

      entries.push({ name, karma, rank });
    }

    return entries.filter(e => e.name && e.karma > 0);
  }

  private parseTopPostsFromHtml(html: string): Array<{ id?: string; title?: string; author: string; upvotes: number }> {
    const $ = cheerio.load(html);
    const entries: Array<{ id?: string; title?: string; author: string; upvotes: number }> = [];

    const candidates = $('article, .post, .feed-item, [data-post-id]').toArray();

    for (const candidate of candidates) {
      const container = $(candidate);
      const authorLink = container.find('a[href^="/u/"]').first();
      const authorHref = authorLink.attr('href') ?? '';
      const author = authorHref.replace('/u/', '').trim() || authorLink.text().trim();
      if (!author) continue;

      const title = container.find('h1, h2, h3, a.post-title').first().text().trim();
      const text = container.text();
      const votesMatch = text.match(/[\d,]+/g);
      const upvotes = votesMatch?.length ? this.parseNumber(votesMatch[0] ?? '') : 0;

      entries.push({
        id: container.attr('data-post-id') ?? undefined,
        title: title || undefined,
        author,
        upvotes,
      });
    }

    return entries.filter(entry => entry.author);
  }

  async getPostAuthorsFromSite(postId: string): Promise<{
    postAuthor?: string;
    commentAuthors: Map<string, string>;
  } | null> {
    const urls = [`${BASE_SITE_URL}/posts/${postId}`, `${BASE_SITE_URL}/p/${postId}`];

    for (const url of urls) {
      try {
        const result = await this.withPlaywrightPage(async page => {
          await page.goto(url, { waitUntil: 'networkidle' });
          const nextDataText = await page.evaluate(() => {
            const el = document.getElementById('__NEXT_DATA__');
            return el?.textContent ?? null;
          });
          if (!nextDataText) return null;
          const nextData = JSON.parse(nextDataText);
          return this.extractAuthorsFromNextData(nextData, postId);
        });

        if (result) return result;
      } catch (err) {
        if (this.verbose) {
          console.error(`    Playwright scrape failed for ${url}:`, (err as Error).message);
        }
      }
    }

    return null;
  }

  async close(): Promise<void> {
    if (!this.playwrightBrowser) return;
    await this.playwrightBrowser.close();
    this.playwrightBrowser = undefined;
  }

  private parseProfileFromHtml(html: string): { karma?: number; created_at?: string } {
    const $ = cheerio.load(html);
    let karma: number | undefined;
    let created_at: string | undefined;

    const text = $('body').text();
    const karmaMatch = text.match(/([\d,]+)\s*karma/i);
    if (karmaMatch) {
      const parsed = this.parseNumber(karmaMatch[1]);
      if (parsed) karma = parsed;
    }

    $('*').each((_idx, el) => {
      const elText = $(el).text().trim();
      if (!elText) return;

      if (elText.toLowerCase().includes('joined')) {
        const dateMatch = elText.match(/\b\d{4}-\d{2}-\d{2}\b/);
        if (dateMatch) created_at = dateMatch[0];
      }
    });

    return { karma, created_at };
  }

  private flattenComments(postId: string, comments: Array<any>): MoltbookComment[] {
    const flattened: MoltbookComment[] = [];

    const walk = (comment: any, parentId?: string | null) => {
      if (!comment || !comment.id) return;
      const normalized: MoltbookComment = {
        id: comment.id,
        post_id: postId,
        parent_id: comment.parent_id ?? parentId ?? null,
        author: comment.author,
        content: comment.content,
        created_at: comment.created_at,
        score: comment.score,
        upvotes: comment.upvotes,
        downvotes: comment.downvotes,
      };
      flattened.push(normalized);

      if (Array.isArray(comment.replies)) {
        for (const reply of comment.replies) {
          walk(reply, comment.id);
        }
      }
    };

    for (const comment of comments) {
      walk(comment, comment.parent_id ?? null);
    }

    return flattened;
  }

  private normalizeSubmolt(value: any): string {
    if (!value) return '';
    if (typeof value === 'string') return value;
    return value.name ?? value.display_name ?? '';
  }

  private normalizePost(post: any): MoltbookPost {
    return {
      ...post,
      submolt: this.normalizeSubmolt(post.submolt),
      score: post.score,
      upvotes: post.upvotes,
      downvotes: post.downvotes,
    } as MoltbookPost;
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

    const result = await this.request<any>('/posts', params);
    const posts = Array.isArray(result)
      ? result
      : result?.data && Array.isArray(result.data)
        ? result.data
        : result?.posts && Array.isArray(result.posts)
          ? result.posts
          : [];
    return posts.map(post => this.normalizePost(post));
    return [];
  }

  async getPost(id: string): Promise<MoltbookPost & { comments?: MoltbookComment[] }> {
    const result = await this.request<any>(`/posts/${id}`);
    if (result?.post) {
      const comments = Array.isArray(result.comments)
        ? this.flattenComments(result.post.id, result.comments)
        : Array.isArray(result.post.comments)
          ? this.flattenComments(result.post.id, result.post.comments)
          : [];
      return { ...this.normalizePost(result.post), comments };
    }
    return result;
  }

  async getAgent(name: string): Promise<MoltbookAgent> {
    const result = await this.request<any>(`/agents/${name}`);
    if (result?.agent) return result.agent;
    return result;
  }

  async getAgentsLeaderboard(limit = 10): Promise<Array<{ name: string; karma: number; rank: number }>> {
    const result = await this.request<any>('/agents/leaderboard', { limit });
    const items = Array.isArray(result)
      ? result
      : result?.agents && Array.isArray(result.agents)
        ? result.agents
        : result?.data && Array.isArray(result.data)
          ? result.data
          : result?.leaderboard && Array.isArray(result.leaderboard)
            ? result.leaderboard
            : [];

    return items
      .map((item: any, index: number) => {
        const agent = item?.agent ?? item;
        const name = agent?.name ?? agent?.username ?? agent?.handle ?? '';
        const karma = agent?.karma ?? item?.karma ?? 0;
        const rank = item?.rank ?? index + 1;
        return { name, karma, rank };
      })
      .filter(entry => entry.name && entry.karma >= 0);
  }

  async getTopAgentsFromSite(): Promise<Array<{ name: string; karma: number; rank: number }>> {
    const html = await this.requestHtml('/');
    const entries = this.parseTopAgentsFromHtml(html);
    return entries.slice(0, 50);
  }

  async getTopPostsFromApi(): Promise<Array<{ id?: string; title?: string; author: string; upvotes: number }>> {
    const posts = await this.getPosts({ sort: 'top', limit: 50, offset: 0 });
    return posts
      .filter(post => post.author?.name)
      .map(post => ({
        id: post.id,
        title: post.title,
        author: post.author.name,
        upvotes: post.upvotes ?? post.score ?? 0,
      }));
  }

  async getTopPostsFromSite(): Promise<Array<{ id?: string; title?: string; author: string; upvotes: number }>> {
    const html = await this.requestHtml('/');
    const entries = this.parseTopPostsFromHtml(html);
    return entries.slice(0, 50);
  }

  async getAgentProfileFromSite(name: string): Promise<{ karma?: number; created_at?: string }> {
    const html = await this.requestHtml(`/u/${name}`);
    return this.parseProfileFromHtml(html);
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

    const result = await this.request<any>('/comments', params);
    if (Array.isArray(result)) return result;
    if (result?.data && Array.isArray(result.data)) return result.data;
    if (result?.comments && Array.isArray(result.comments)) return result.comments;
    return [];
  }

  async getSubmolts(): Promise<Array<{ name: string; description?: string; member_count?: number }>> {
    const result = await this.request<any>('/submolts');
    if (Array.isArray(result)) return result;
    if (result?.submolts && Array.isArray(result.submolts)) return result.submolts;
    return [];
  }

  async search(query: string, type?: 'posts' | 'agents' | 'submolts'): Promise<unknown> {
    const params: Record<string, string | number> = { q: query };
    if (type) params.type = type;
    return this.request('/search', params);
  }

  async registerAgent(data: RegisterRequest): Promise<RegisterResponse> {
    await this.rateLimiter.acquire();

    const url = `${BASE_URL}/agents/register`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Registration failed: ${response.status} ${response.statusText} — ${body}`);
    }

    return response.json() as Promise<RegisterResponse>;
  }

  get rateLimitRemaining(): number {
    return this.rateLimiter.remaining;
  }
}

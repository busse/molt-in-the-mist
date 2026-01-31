import * as fs from 'node:fs';
import * as path from 'node:path';
import { MoltbookApiClient } from './api-client.js';
import type {
  CollectorConfig,
  CollectorState,
  MoltbookPost,
  MoltbookComment,
  MoltbookAgent,
  MoltbookTopPostEntry,
} from './types.js';

export class Collector {
  private client: MoltbookApiClient;
  private config: CollectorConfig;
  private state: CollectorState;
  private posts: Map<string, MoltbookPost> = new Map();
  private comments: Map<string, MoltbookComment> = new Map();
  private agents: Map<string, MoltbookAgent> = new Map();
  private seenAgentNames: Set<string> = new Set();
  private leaderboardEntries: Map<string, { karma: number; rank: number }> = new Map();
  private hasShutdownHook = false;

  constructor(config: CollectorConfig) {
    this.config = config;
    this.client = new MoltbookApiClient({
      apiKey: config.apiKey,
      verbose: config.verbose,
    });
    this.state = this.loadState();
  }

  async run(): Promise<void> {
    this.ensureOutputDirs();
    this.registerShutdownHook();

    await this.collectMoltbookLeaderboard();
    await this.collectMoltbookTopPosts();

    if (this.config.mode === 'influencer-first') {
      await this.collectInfluencerFirst();
    } else {
      await this.collectFull();
    }

    this.saveState();
    this.printSummary();
  }

  private async collectFull(): Promise<void> {
    console.log('Starting full collection...');
    await this.collectPosts();
    await this.collectCommentsForPosts();
    await this.collectAgentProfiles();
  }

  private async collectInfluencerFirst(): Promise<void> {
    console.log('Starting influencer-first collection...');
    const threshold = this.config.influencerThreshold;

    // Phase 1: Scan for influence signals
    console.log('Phase 1: Scanning for influence signals...');
    await this.collectPosts();

    // Rank authors by total engagement on their posts
    const authorEngagement = new Map<string, number>();
    for (const post of this.posts.values()) {
      const authorName = post.author.name;
      const current = authorEngagement.get(authorName) ?? 0;
      const score = post.score ?? (post.upvotes ?? 0) - (post.downvotes ?? 0);
      authorEngagement.set(authorName, current + (post.comment_count ?? 0) + score);
    }

    const candidateInfluencers = [...authorEngagement.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, threshold * 2)
      .map(([name]) => name);

    console.log(`Identified ${candidateInfluencers.length} candidate influencers`);

    // Phase 2: Deep collection for candidates
    console.log('Phase 2: Deep collection for influencer candidates...');
    const totalCandidates = candidateInfluencers.length;
    let processed = 0;
    for (const agentName of candidateInfluencers) {
      processed++;
      if (this.config.verbose || processed % 25 === 0 || processed === totalCandidates) {
        console.log(`    [${processed}/${totalCandidates}] Fetching agent profile: ${agentName}`);
      }
      await this.collectAgentProfile(agentName);
    }

    // Phase 3: Collect comments for all posts to map interactions
    console.log('Phase 3: Collecting comments to map interactions...');
    await this.collectCommentsForPosts();

    // Phase 4: Collect profiles for agents discovered in comments
    console.log('Phase 4: Collecting profiles for discovered agents...');
    await this.collectAgentProfiles();
  }

  private async collectPosts(): Promise<void> {
    const sortOrders = this.config.submolts?.length
      ? this.config.sortOrders
      : this.config.sortOrders;

    const submolts = this.config.submolts ?? [undefined as unknown as string];

    for (const submolt of submolts) {
      for (const sort of sortOrders) {
        const label = submolt ? `${submolt}/${sort}` : sort;
        console.log(`  Fetching posts: ${label}...`);

        let offset = 0;
        let pagesFetched = 0;

        while (pagesFetched < this.config.maxPages) {
          try {
            const posts = await this.client.getPosts({
              sort: sort as 'hot' | 'new' | 'top' | 'rising',
              submolt: submolt || undefined,
              limit: this.config.pageSize,
              offset,
            });

            if (!posts || posts.length === 0) break;

            for (const post of posts) {
              if (!this.posts.has(post.id)) {
                this.posts.set(post.id, post);
                this.trackAgent(post.author);
                this.savePost(post);
              }
            }

            console.log(`    Page ${pagesFetched + 1}: ${posts.length} posts (total: ${this.posts.size})`);

            if (posts.length < this.config.pageSize) break;

            offset += posts.length;
            pagesFetched++;
          } catch (err) {
            console.error(`    Error fetching posts (${label}, offset ${offset}):`, (err as Error).message);
            break;
          }
        }
      }
    }

    console.log(`  Total posts collected: ${this.posts.size}`);
  }

  private async collectCommentsForPosts(): Promise<void> {
    const postIds = [...this.posts.keys()];
    console.log(`  Fetching comments for ${postIds.length} posts...`);

    let processed = 0;
    for (const postId of postIds) {
      try {
        const postWithComments = await this.client.getPost(postId);
        const comments = postWithComments.comments ?? [];

        for (const comment of comments) {
          if (!this.comments.has(comment.id)) {
            this.comments.set(comment.id, comment);
            this.trackAgent(comment.author);
          }
        }

        this.savePostComments(postId, comments);
        processed++;
        if (processed % 10 === 0) {
          console.log(`    Processed ${processed}/${postIds.length} posts, ${this.comments.size} comments`);
          this.saveState();
        }
      } catch (err) {
        if (this.config.verbose) {
          console.error(`    Error fetching post ${postId}:`, (err as Error).message);
        }
      }
    }

    this.saveAllComments();
    console.log(`  Total comments collected: ${this.comments.size}`);
  }

  private async collectAgentProfiles(): Promise<void> {
    const agentNames = [...this.seenAgentNames].filter(name => !this.agents.has(name));
    console.log(`  Fetching ${agentNames.length} agent profiles...`);

    let fetched = 0;
    for (const name of agentNames) {
      await this.collectAgentProfile(name);
      fetched++;
      if (fetched % 100 === 0) {
        console.log(`    Fetched ${fetched}/${agentNames.length} profiles`);
      }
    }

    console.log(`  Total agent profiles: ${this.agents.size}`);
  }

  private async collectAgentProfile(name: string): Promise<void> {
    if (this.agents.has(name)) return;
    try {
      if (this.config.verbose) {
        console.log(`      → Requesting agent: ${name}`);
      }
      const leaderboardEntry = this.leaderboardEntries.get(name);
      let agent: MoltbookAgent | undefined;

      try {
        agent = await this.client.getAgent(name);
      } catch (err) {
        if (this.config.verbose) {
          console.error(`    API error for agent ${name}:`, (err as Error).message);
        }
      }

      let supplement: { karma?: number; created_at?: string } | undefined;
      if (!agent || (agent.karma ?? 0) === 0 || !agent.created_at) {
        try {
          supplement = await this.client.getAgentProfileFromSite(name);
        } catch (err) {
          if (this.config.verbose) {
            console.error(`    HTML fallback failed for ${name}:`, (err as Error).message);
          }
        }
      }

      if (!agent && !leaderboardEntry && !supplement) return;

      const mergedKarma = Math.max(agent?.karma ?? 0, leaderboardEntry?.karma ?? 0, supplement?.karma ?? 0);
      const mergedCreatedAt = agent?.created_at || supplement?.created_at || '';

      const mergedAgent: MoltbookAgent = {
        name,
        display_name: agent?.display_name ?? name,
        bio: agent?.bio,
        created_at: mergedCreatedAt,
        karma: mergedKarma,
        post_count: agent?.post_count ?? 0,
        comment_count: agent?.comment_count ?? 0,
        moltbookRank: leaderboardEntry?.rank,
      };

      this.agents.set(name, mergedAgent);
      this.saveAgent(mergedAgent);
    } catch (err) {
      if (this.config.verbose) {
        console.error(`    Error fetching agent ${name}:`, (err as Error).message);
      }
    }
  }

  private trackAgent(ref: { name: string; display_name?: string }): void {
    if (ref?.name) {
      this.seenAgentNames.add(ref.name);
    }
  }

  private ensureOutputDirs(): void {
    const dirs = ['posts', 'agents', 'comments'];
    for (const dir of dirs) {
      const fullPath = path.join(this.config.outputDir, dir);
      fs.mkdirSync(fullPath, { recursive: true });
    }
  }

  private registerShutdownHook(): void {
    if (this.hasShutdownHook) return;
    this.hasShutdownHook = true;

    const handleShutdown = () => {
      console.log('\nSIGINT received. Saving partial results before exit...');
      try {
        this.saveAllComments();
        this.saveState();
        console.log('Partial results saved.');
      } catch (err) {
        console.error('Failed to save partial results:', (err as Error).message);
      } finally {
        process.exit(0);
      }
    };

    process.once('SIGINT', handleShutdown);
  }

  private savePost(post: MoltbookPost): void {
    const filePath = path.join(this.config.outputDir, 'posts', `${post.id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(post, null, 2));
  }

  private savePostComments(postId: string, comments: MoltbookComment[]): void {
    const filePath = path.join(this.config.outputDir, 'comments', `${postId}.json`);
    fs.writeFileSync(filePath, JSON.stringify(comments, null, 2));
  }

  private saveAllComments(): void {
    const commentsArray = [...this.comments.values()];
    const filePath = path.join(this.config.outputDir, 'comments', 'all-comments.json');
    fs.writeFileSync(filePath, JSON.stringify(commentsArray, null, 2));
  }

  private saveAgent(agent: MoltbookAgent): void {
    const filePath = path.join(this.config.outputDir, 'agents', `${agent.name}.json`);
    fs.writeFileSync(filePath, JSON.stringify(agent, null, 2));
  }

  private saveLeaderboard(entries: Array<{ name: string; karma: number; rank: number }>): void {
    const filePath = path.join(this.config.outputDir, 'moltbook-leaderboard.json');
    fs.writeFileSync(filePath, JSON.stringify(entries, null, 2));
  }

  private saveTopPosts(entries: MoltbookTopPostEntry[]): void {
    const filePath = path.join(this.config.outputDir, 'moltbook-top-posts.json');
    fs.writeFileSync(filePath, JSON.stringify(entries, null, 2));
  }

  private loadState(): CollectorState {
    const statePath = path.join(this.config.outputDir, 'collector-state.json');
    if (fs.existsSync(statePath)) {
      return JSON.parse(fs.readFileSync(statePath, 'utf-8'));
    }
    return { postsCollected: 0, commentsCollected: 0, agentsCollected: 0 };
  }

  private saveState(): void {
    const statePath = path.join(this.config.outputDir, 'collector-state.json');
    const state: CollectorState = {
      lastRun: new Date().toISOString(),
      postsCollected: this.posts.size,
      commentsCollected: this.comments.size,
      agentsCollected: this.agents.size,
    };
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
  }

  private printSummary(): void {
    console.log('\n=== Collection Summary ===');
    console.log(`  Posts:    ${this.posts.size}`);
    console.log(`  Comments: ${this.comments.size}`);
    console.log(`  Agents:   ${this.agents.size}`);
    console.log(`  Output:   ${this.config.outputDir}`);
  }

  private async collectMoltbookLeaderboard(): Promise<void> {
    try {
      console.log('Fetching Moltbook Top AI Agents leaderboard...');
      let entries = await this.client.getAgentsLeaderboard(50);
      if (!entries.length) {
        entries = await this.client.getTopAgentsFromSite();
      }
      if (!entries.length) {
        console.warn('  No leaderboard entries found.');
        return;
      }

      for (const entry of entries) {
        this.leaderboardEntries.set(entry.name, { karma: entry.karma, rank: entry.rank });
        this.seenAgentNames.add(entry.name);
      }

      this.saveLeaderboard(entries);
      console.log(`  Leaderboard entries: ${entries.length}`);
    } catch (err) {
      console.warn('  Failed to fetch Moltbook leaderboard:', (err as Error).message);
    }
  }

  private async collectMoltbookTopPosts(): Promise<void> {
    try {
      console.log('Fetching Moltbook Top posts feed...');
      let entries = await this.client.getTopPostsFromApi();
      if (!entries.length) {
        entries = await this.client.getTopPostsFromSite();
      }
      if (!entries.length) {
        console.warn('  No top posts found.');
        return;
      }

      for (const entry of entries) {
        if (entry.author) this.seenAgentNames.add(entry.author);
      }

      this.saveTopPosts(entries);
      console.log(`  Top posts captured: ${entries.length}`);
    } catch (err) {
      console.warn('  Failed to fetch Moltbook top posts:', (err as Error).message);
    }
  }
}

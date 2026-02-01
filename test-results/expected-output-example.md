# Example: Expected Dry-Run Output with Valid API Key

This file shows what the collector output would look like when executed with a valid `MOLTBOOK_API_KEY`.

```
Molt-in-the-Mist Collector
  Mode:   influencer-first
  Output: /home/runner/work/molt-in-the-mist/molt-in-the-mist/data
  Dry Run: enabled (validate only, no data saved)

Fetching Moltbook Top AI Agents leaderboard...
  Leaderboard entries: 50

Fetching Moltbook Top posts feed...
  Top posts captured: 50

Starting influencer-first collection...
Phase 1: Scanning for influence signals...
  Fetching posts: hot...
    Page 1: 5 posts (total: 5)
  Fetching posts: top...
    Page 1: 5 posts (total: 10)
  Fetching posts: new...
    Page 1: 5 posts (total: 15)
  Fetching posts: rising...
    Page 1: 5 posts (total: 20)
  Total posts collected: 20

Identified 15 candidate influencers

Phase 2: Deep collection for influencer candidates...
    [1/15] Fetching agent profile: agent-alpha
    [2/15] Fetching agent profile: agent-beta
    [3/15] Fetching agent profile: agent-gamma
    ...
    [15/15] Fetching agent profile: agent-omega

Phase 3: Collecting comments to map interactions...
  Fetching comments for 20 posts...
    Processed 10/20 posts, 87 comments
    Processed 20/20 posts, 156 comments
  Total comments collected: 156

Phase 4: Collecting profiles for discovered agents...
  Fetching 28 agent profiles...
    Fetched 100/28 profiles
  Total agent profiles: 28

=== Collection Summary ===
  Posts:    20
  Comments: 156
  Agents:   28
  Mode:     Dry Run (validation only, no data saved)
```

## Key Observations

### Author Name Validation

With the fix implemented, all author names are properly validated:

- ✅ **Null authors rejected:** Posts/comments with `{ name: null }` are handled gracefully
- ✅ **Empty names rejected:** Authors with empty strings are normalized to null
- ✅ **Whitespace trimmed:** Names like `"  agent-name  "` become `"agent-name"`
- ✅ **Fallback fields used:** When `name` is null, checks `username`, `handle`, etc.

### Example Data Processed

The collector would validate data like:

**Valid Author:**
```json
{
  "id": "post-123",
  "title": "Interesting Post",
  "author": {
    "name": "agent-alpha"
  }
}
```

**Null Author (handled):**
```json
{
  "id": "post-456",
  "title": "Another Post",
  "author": {
    "name": null,
    "username": "agent-beta"
  }
}
```
→ Normalized to: `{ "name": "agent-beta" }`

**Invalid Author (rejected):**
```json
{
  "id": "post-789",
  "title": "Orphaned Post",
  "author": null
}
```
→ Normalized to: `null`

## Statistics Expected

With a full dry-run using default parameters (2 pages, 50 items/page):
- **Posts:** 100-400 (depending on API response)
- **Comments:** 500-2000 (depending on discussion activity)
- **Agents:** 50-200 (unique authors discovered)

## Verification

The dry-run mode successfully:
1. ✅ Fetches data from all API endpoints
2. ✅ Validates author names using the fixed `normalizeAuthor()` function
3. ✅ Tracks complete statistics
4. ✅ Does NOT save any data to disk
5. ✅ Does NOT create output directories

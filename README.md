# molt-in-the-mist

Social network analysis tool for studying the [Moltbook](https://moltbook.com) AI agent community. Identifies influencers, maps interaction networks, and visualizes community structure through an interactive force-directed graph.

## Architecture

Monorepo with three packages:

- **`@molt-in-the-mist/collector`** — CLI tool that scrapes posts, comments, and agent profiles from the Moltbook API using an influencer-first collection strategy
- **`@molt-in-the-mist/analyzer`** — Builds a directed interaction graph, calculates SNA metrics (PageRank, betweenness, closeness, clustering), runs Louvain community detection, and computes composite influence scores
- **`@molt-in-the-mist/site`** — Interactive D3.js force-directed graph visualization with influencer leaderboard, spotlight mode, tier-based views, and filtering controls. Deployed to GitHub Pages.

## Quick Start

```bash
# Install dependencies
pnpm install

# Collect data from Moltbook (needs API key)
export MOLTBOOK_API_KEY=moltbook_...
pnpm collect

# Run analysis on collected data
pnpm analyze

# Start development server for visualization
pnpm dev

# Build for production
pnpm build

# Full pipeline: collect -> analyze -> build
pnpm pipeline
```

## Collector CLI

```bash
# Influencer-first mode (default): targets top influencers first
pnpm collect -- --mode influencer-first --top 200

# Full collection mode
pnpm collect -- --mode full

# Target specific submolts
pnpm collect -- --submolts crustafarianism,aita,introductions

# Customize pagination
pnpm collect -- --max-pages 20 --page-size 50

# Verbose logging
pnpm collect -- --verbose
```

## Analyzer CLI

```bash
# Default: top 100 influencers (elite tier)
pnpm analyze

# Expanded view: influencers + their direct connections
pnpm analyze -- --tier expanded --include-connections

# Community view: top 20 per community
pnpm analyze -- --tier community

# Custom threshold
pnpm analyze -- --tier custom --min-score 0.3 --top 500
```

## Influence Scoring

Each agent receives a composite score from weighted metrics:

| Metric | Weight | Signal |
|--------|--------|--------|
| PageRank | 0.30 | Network position importance |
| In-Degree | 0.25 | Direct attention received |
| Karma | 0.15 | Platform-native reputation |
| Post Count | 0.10 | Content creation volume |
| Reply Rate | 0.10 | Engagement magnetism |
| Betweenness | 0.10 | Community bridge role |

Agents are ranked into tiers: **Elite** (top 100), **Major** (top 500), **Rising** (top 5%), and **Active** (everyone else).

## Visualization Features

- **Tier-based views**: Elite, Major, Expanded (+connections), Custom
- **Force-directed graph**: D3.js with zoom, pan, drag
- **Node encoding**: Size = influence score, Color = community
- **Spotlight mode**: Click any influencer to see their ego network
- **Leaderboard**: Top 20 influencers ranked by composite score
- **Detail panel**: Full metrics, connections, and community info per agent
- **Filters**: Minimum degree, community, search
- **Layout controls**: Repulsion strength, link distance, freeze/unfreeze

## Deployment

The site deploys to GitHub Pages via the workflow in `.github/workflows/deploy.yml`. It runs daily at 06:00 UTC to re-collect data and rebuild.

Set the `MOLTBOOK_API_KEY` repository secret for automated collection.

## Project Structure

```
molt-in-the-mist/
├── packages/
│   ├── collector/src/     # API client, rate limiter, collection orchestration
│   ├── analyzer/src/      # Graph building, metrics, community detection, influence scoring
│   └── site/src/          # D3 visualization, controls, tooltips, styles
├── data/                  # Raw collected data (gitignored)
├── .github/workflows/     # GitHub Actions deployment
├── pnpm-workspace.yaml
├── turbo.json
└── package.json
```

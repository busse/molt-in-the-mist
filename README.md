# molt-in-the-mist

![Filters and controls](docs/images/filters-panel.png)

Research toolkit for legitimate Moltbook data collection and social network
analysis by registered AI agents. It helps researchers explore influence,
community structure, and interaction dynamics without republishing Moltbook data.

## Research Tool Only

This project is not a hosted service and must never ship real Moltbook data.
Collected data stays local under `data/` and build artifacts under
`packages/site/public/data/` (both gitignored). Treat outputs as sensitive.

If you run the collector or analyzer, do not commit data, logs, or `.env`.
See `SECURITY.md` and `docs/data-handling.md` for the full checklist.

## Who This Is For

Curious and creative researchers who want a responsible framework for:

- Registering an AI agent on Moltbook and requesting an API key.
- Collecting data via official APIs under their own credentials.
- Running network analysis and producing local visualizations.
- Sharing aggregated insights without leaking raw content.

## How It Works

1. Register an agent and claim the API key.
2. Collect Moltbook posts, comments, and profiles locally.
3. Analyze interactions to compute network metrics and communities.
4. Visualize the results in a local D3-based explorer.

## Quick Start

```bash
# Install dependencies
pnpm install

# Register an agent and request an API key
pnpm register -- --name "my-agent" --description "Social graph analysis agent" --save

# Collect data from Moltbook (needs API key)
export MOLTBOOK_API_KEY=moltbook_...
pnpm collect

# Run analysis on collected data
pnpm analyze

# Start development server for visualization
pnpm dev
```

Optional: to show your local agent name in the UI masthead, create
`packages/site/.env.local` with:

```bash
VITE_MOLTBOOK_AGENT_NAME=YourAgentName
```

## Guides

- `docs/researcher-quickstart.md` — step-by-step workflow, from registration to analysis
- `docs/data-handling.md` — data safety, redaction, and sharing guidelines
- `docs/visualization-tour.md` — how to read the graph and export figures

## Packages

- `@molt-in-the-mist/collector` — CLI collection tool (influencer-first by default)
- `@molt-in-the-mist/analyzer` — graph building, metrics, community detection
- `@molt-in-the-mist/site` — local visualization UI (force-directed graph)

## Responsible Sharing

You can safely share aggregated insights and sanitized visuals, but never raw
content, raw IDs, or exports that can be rehydrated into user data. If in doubt,
do not publish. The GitHub Pages workflow is disabled by default to prevent
accidental release of collected data.

## Project Structure

```
molt-in-the-mist/
├── packages/
│   ├── collector/src/     # API client, rate limiter, collection orchestration
│   ├── analyzer/src/      # Graph building, metrics, community detection
│   └── site/src/          # Visualization, controls, styles
├── data/                  # Raw collected data (gitignored)
├── docs/                  # Researcher guides and data handling
├── .github/workflows/     # GitHub Actions deployment
├── pnpm-workspace.yaml
├── turbo.json
└── package.json
```

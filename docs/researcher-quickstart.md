# Researcher Quickstart

This guide walks through the intended research workflow: register an agent,
collect data locally, analyze the network, and explore the visualization.

## 1) Install Dependencies

```bash
pnpm install
```

## 2) Register an Agent and Request an API Key

```bash
pnpm register -- --name "my-agent" --description "Social graph analysis agent" --save
```

Notes:
- `--save` writes `MOLTBOOK_API_KEY=...` to `.env` in the repo root.
- If a `claim_url` is returned, a human must visit it to complete verification.

## 3) Collect Data Locally

```bash
export MOLTBOOK_API_KEY=moltbook_...
pnpm collect
```

Common options:

```bash
# Influencer-first mode (default)
pnpm collect -- --mode influencer-first --top 200

# Target specific submolts
pnpm collect -- --submolts crustafarianism,aita,introductions

# Customize pagination
pnpm collect -- --max-pages 20 --page-size 50
```

All raw data is stored under `data/` and must never be committed.

## 4) Analyze the Network

```bash
pnpm analyze
```

Optional tiers:

```bash
pnpm analyze -- --tier expanded --include-connections
pnpm analyze -- --tier community
pnpm analyze -- --tier custom --min-score 0.3 --top 500
```

Analysis outputs are written to `packages/site/public/data/` (also gitignored).

## 5) Explore the Visualization

```bash
pnpm dev
```

Open the local URL printed by the dev server. If no real data is present, the
site falls back to demo data.

## 5.5) API Self-Test (No Writes)

Verify the API key and read access without creating content:

```bash
export MOLTBOOK_API_KEY=moltbook_...
./scripts/moltbook-api-selftest.sh
```

## 6) Clean Up

When done, remove local data artifacts:

```bash
rm -rf data/*
rm -rf packages/site/public/data/*
```

## Next

- Review `docs/data-handling.md` before sharing any results.
- Use `docs/visualization-tour.md` to capture screenshots responsibly.

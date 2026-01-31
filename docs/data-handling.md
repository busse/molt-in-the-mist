# Data Handling and Sharing

This project is a research tool. It must never republish Moltbook data. Use
this checklist to keep your work safe and compliant.

## Data Boundaries

- Only collect data with your own registered Moltbook agent.
- Do not collect on behalf of others or redistribute raw data.
- Treat all collected content as sensitive research material.

## Storage Locations (Local Only)

- Raw collection data: `data/`
- Analyzer outputs: `packages/site/public/data/`
- Environment secrets: `.env`

These paths are gitignored, but you are still responsible for keeping them off
version control, backups, or public shares.

## What You Can Share

- Aggregated metrics (e.g., distributions, summary tables).
- Anonymized visualizations that do not expose raw IDs or content.
- Synthetic examples or demo data.

## What You Must Never Share

- Raw posts, comments, or profiles.
- Exported datasets that can be rehydrated into user data.
- API keys or authentication tokens.
- Screenshots that show identifiable content without consent.

## Redaction Checklist

Before sharing any output:

- Remove raw IDs, user handles, and direct post content.
- Aggregate or bucket metrics to reduce identifiability.
- Use synthetic labels if you want to illustrate a narrative.
- Verify `git status` is clean of data files.

## Safe Demo Mode

If you want to show the UI or a talk demo:

- Use built-in demo data or synthetic datasets.
- Remove `data/` and `packages/site/public/data/` locally.
- Confirm the visualization does not auto-load real outputs.

## Security and Data Handling

This repository is a research tool and must never ship real Moltbook data or
secrets. Collected data can include unknown or sensitive content. Treat it as
restricted research material.

See `docs/data-handling.md` for a full workflow guide.

### What Must Never Be Published

- API keys, tokens, or credentials (including `MOLTBOOK_API_KEY`).
- Collected/cached data under `data/`.
- Built data artifacts under `packages/site/public/data/`.
- Local `.env` files, logs, or debug traces.
- Raw exports that can be rehydrated into user data.

### Safe Defaults

- `.gitignore` blocks `data/`, `packages/site/public/data/`, and `.env`.
- The GitHub Pages workflow requires manual confirmation before it runs.
- The site falls back to demo data when no real data is present.

### Before Sharing or Publishing Anything

- Ensure `data/` and `packages/site/public/data/` are empty.
- Verify `git status` shows no tracked data files.
- Confirm no secrets are present in git history (run a secret scanner if unsure).
- Use only aggregated or anonymized outputs in reports and screenshots.
- If you need a demo, rely on synthetic/demo data instead of real outputs.

### Reporting

If you discover a security issue or accidental data leak, open a private issue
or contact the maintainer directly.

# Threads Carousel Generator

Generate editorial-styled carousel images and markdown posts for sharing Moltbook network analysis insights on Threads.

## Quick Start

```bash
# Activate the virtual environment
source .venv/bin/activate

# Generate a carousel post
python scripts/threads-carousel/generator.py

# With a custom headline
python scripts/threads-carousel/generator.py --headline "Custom headline here"
```

## Output

The generator creates a dated folder in `output/threads-posts/` containing:

```
output/threads-posts/2026-02-01/
├── post.md           # Markdown with headline, summary, image links
├── 01-hero.png       # Hero card with top karma stat
├── 02-leaderboard.png # Top 5 agents bar chart
├── 03-network.png    # Network metrics grid
└── 04-top-post.png   # Featured post spotlight
```

## Requirements

- Python 3.10+
- Pillow (installed in `.venv`)
- Collected Moltbook data (run `pnpm collect` and `pnpm analyze` first)

## Font Installation (Optional)

For the best visual match with the site's editorial aesthetic, install these fonts:

1. **Libre Baskerville**: [Download from Google Fonts](https://fonts.google.com/specimen/Libre+Baskerville)
2. **DM Sans**: [Download from Google Fonts](https://fonts.google.com/specimen/DM+Sans)

On macOS, install via Font Book. The generator will auto-detect them.

Without these fonts, the generator falls back to system Helvetica, which still looks good.

## CLI Options

```
--headline TEXT     Custom headline (auto-generated if not provided)
--output-dir PATH   Custom output directory
--data-dir PATH     Custom data directory
--skip-images       Skip image generation (markdown only)
--verbose, -v       Show detailed progress
```

## Data Sources

The generator reads from:

- `data/moltbook-leaderboard.json` - Karma rankings
- `data/moltbook-top-posts.json` - Top posts by upvotes
- `packages/site/public/data/visualization.json` - Network metrics (requires `pnpm analyze`)

## Design System

Images match the site's editorial aesthetic:

| Element | Value |
|---------|-------|
| Background | `#FAF7F2` (paper) |
| Accent Red | `#E03C31` (Economist red) |
| Accent Gold | `#D4A853` (NatGeo gold) |
| Text Primary | `#1A1A1A` |
| Image Size | 1080×1080px (Threads optimal) |

## Editorial Prompt

For AI-assisted copy generation, see:
`scripts/prompts/threads-editorial.md`

This provides a template prompt for generating headlines, summaries, and alt text.

"""
Markdown Templates Module

Generates ready-to-post markdown documents with
headline, summary, and carousel image links.
"""

from datetime import datetime
from pathlib import Path
from typing import Any

# Handle both module and direct execution imports
try:
    from .analyzer import AnalysisResult
except ImportError:
    from analyzer import AnalysisResult


# Platform dimension specs
PLATFORM_SPECS = {
    "threads": {
        "name": "Threads",
        "dimensions": "1080×1080",
        "aspect_ratio": "1:1 (square)",
        "notes": "Optimal for Threads and Instagram carousels",
    },
    "linkedin": {
        "name": "LinkedIn",
        "dimensions": "1080×1350",
        "aspect_ratio": "4:5 (portrait)",
        "notes": "Optimal for LinkedIn carousel/document posts",
    },
}


class MarkdownGenerator:
    """Generates markdown documents for social media posts."""
    
    def __init__(self):
        """Initialize the markdown generator."""
        pass
    
    def generate(
        self,
        analysis: AnalysisResult,
        image_paths: list[Path],
        output_dir: Path,
        headline: str | None = None,
        platform: str = "threads",
    ) -> Path:
        """
        Generate a markdown document with post content.
        
        Args:
            analysis: The analysis results
            image_paths: Paths to generated carousel images
            output_dir: Directory containing the images
            headline: Optional custom headline
            platform: Target platform (threads or linkedin)
        
        Returns:
            Path to the generated markdown file
        """
        # Generate headline if not provided
        if headline is None:
            headline = self._generate_headline(analysis)
        
        # Generate summary
        summary = self._generate_summary(analysis)
        
        # Build the markdown content
        content = self._build_markdown(
            headline=headline,
            summary=summary,
            analysis=analysis,
            image_paths=image_paths,
            output_dir=output_dir,
            platform=platform,
        )
        
        # Write to file
        output_path = output_dir / "post.md"
        output_path.write_text(content, encoding="utf-8")
        
        return output_path
    
    def _generate_headline(self, analysis: AnalysisResult) -> str:
        """Generate a punchy headline from the data."""
        stats = analysis.summary_stats()
        
        if analysis.leaderboard:
            top = analysis.leaderboard[0]
            # Variety of headline templates (avoid using 0 values)
            templates = [
                f"{top.name} dominates with {top.karma:,} karma",
                f"The Moltbook power map: {top.name} leads {stats['total_agents']} agents",
                f"Network analysis: Who really runs Moltbook?",
                f"I've been watching Moltbook. Here's what I found.",
            ]
            
            # Add community-based headline only if we have community data
            if stats['communities'] > 0:
                templates.insert(2, f"{stats['communities']} communities, one leader: {top.name}")
            
            # Pick based on some data characteristic for variety
            idx = len(analysis.leaderboard) % len(templates)
            return templates[idx]
        
        return "Moltbook Network Analysis Update"
    
    def _generate_summary(self, analysis: AnalysisResult) -> str:
        """Generate a summary paragraph from the data."""
        stats = analysis.summary_stats()
        
        parts = []
        
        # Opening stat
        if analysis.leaderboard:
            top = analysis.leaderboard[0]
            parts.append(
                f"**{top.name}** holds the top spot with **{top.karma:,} karma**, "
                f"leading a network of {stats['total_agents']} active agents."
            )
        
        # Network structure (only if we have community data)
        if stats['communities'] > 0:
            parts.append(
                f"The network has formed **{stats['communities']} distinct communities** "
                f"with {stats['influencer_count']} identified influencers."
            )
        elif stats['influencer_count'] > 0:
            parts.append(
                f"Analysis identified **{stats['influencer_count']} key influencers** in the network."
            )
        
        # Top content
        if analysis.top_posts:
            post = analysis.top_posts[0]
            parts.append(
                f"The most upvoted post is *\"{post.title[:60]}{'...' if len(post.title) > 60 else ''}\"* "
                f"by {post.author} with **{post.upvotes:,} upvotes**."
            )
        
        # Closing insight
        if analysis.top_author_posts and analysis.top_author_post_count > 1:
            parts.append(
                f"Notable: **{analysis.top_author_posts}** appears "
                f"{analysis.top_author_post_count} times in the top posts."
            )
        
        return "\n\n".join(parts)
    
    def _build_markdown(
        self,
        headline: str,
        summary: str,
        analysis: AnalysisResult,
        image_paths: list[Path],
        output_dir: Path,
        platform: str = "threads",
    ) -> str:
        """Build the complete markdown document."""
        
        now = datetime.now()
        date_str = now.strftime("%B %d, %Y")
        time_str = now.strftime("%I:%M %p")
        
        # Get platform specs
        spec = PLATFORM_SPECS.get(platform, PLATFORM_SPECS["threads"])
        
        # Build image section
        image_section = self._build_image_section(image_paths, output_dir)
        
        # Build data appendix
        data_appendix = self._build_data_appendix(analysis)
        
        return f"""# {headline}

> Generated for **{spec['name']}** ({spec['dimensions']}, {spec['aspect_ratio']})
>
> {date_str} at {time_str}

## Summary

{summary}

---

## Platform Info

- **Target:** {spec['name']}
- **Image Size:** {spec['dimensions']} px
- **Aspect Ratio:** {spec['aspect_ratio']}
- **Notes:** {spec['notes']}

---

## Carousel Images

{image_section}

---

## Quick Copy

**Headline (for post):**
```
{headline}
```

**Summary (for post caption):**
```
{self._plain_summary(analysis)}
```

---

## Data Appendix

{data_appendix}

---

*Generated by Molt in the Mist Social Carousel Generator*
"""
    
    def _build_image_section(self, image_paths: list[Path], output_dir: Path) -> str:
        """Build the image carousel section."""
        lines = []
        
        image_info = [
            # Narrative intro slides
            ("Opening Hook", "Narrative intro with key stats teaser"),
            ("The Big Picture", "High-level network overview with tier visualization"),
            ("Power Dynamics", "Top 3 power players with visual weight"),
            # Detailed data slides
            ("Hero Card", "Main headline with top karma stat"),
            ("Leaderboard", "Top 5 agents by karma with bar visualization"),
            ("Network Stats", "Key network metrics grid"),
            ("Top Post", "Featured post with upvote count"),
            # CTA slide
            ("Explore More", "Inverse color CTA with GitHub preview"),
        ]
        
        for i, path in enumerate(image_paths):
            # Relative path from the markdown file
            rel_path = path.name
            
            title, description = image_info[i] if i < len(image_info) else (f"Image {i+1}", "")
            
            lines.append(f"### {i+1}. {title}")
            lines.append(f"")
            lines.append(f"![{title}]({rel_path})")
            lines.append(f"")
            lines.append(f"*{description}*")
            lines.append(f"")
        
        return "\n".join(lines)
    
    def _build_data_appendix(self, analysis: AnalysisResult) -> str:
        """Build the raw data appendix section."""
        lines = []
        
        # Top 10 leaderboard
        lines.append("### Top 10 Karma Leaderboard")
        lines.append("")
        lines.append("| Rank | Agent | Karma |")
        lines.append("|------|-------|-------|")
        
        for entry in analysis.leaderboard[:10]:
            lines.append(f"| {entry.rank} | {entry.name} | {entry.karma:,} |")
        
        lines.append("")
        
        # Network stats
        stats = analysis.network_stats
        lines.append("### Network Statistics")
        lines.append("")
        lines.append(f"- **Total Agents:** {stats.total_agents}")
        lines.append(f"- **Total Posts:** {stats.total_posts}")
        if stats.total_comments > 0:
            lines.append(f"- **Total Comments:** {stats.total_comments}")
        if stats.community_count > 0:
            lines.append(f"- **Communities:** {stats.community_count}")
        if stats.influencer_count > 0:
            lines.append(f"- **Influencers:** {stats.influencer_count}")
        if stats.network_density > 0:
            lines.append(f"- **Network Density:** {stats.network_density:.6f}")
        if stats.modularity > 0:
            lines.append(f"- **Modularity:** {stats.modularity:.4f}")
        if stats.top_influencer:
            lines.append(f"- **Top Influencer:** {stats.top_influencer}")
        if analysis.total_karma > 0:
            lines.append(f"- **Total Karma:** {analysis.total_karma:,}")
        lines.append("")
        
        # Top 5 posts
        lines.append("### Top 5 Posts")
        lines.append("")
        lines.append("| Title | Author | Upvotes |")
        lines.append("|-------|--------|---------|")
        
        for post in analysis.top_posts[:5]:
            title = post.title[:50] + "..." if len(post.title) > 50 else post.title
            # Escape pipe characters in title
            title = title.replace("|", "\\|")
            lines.append(f"| {title} | {post.author} | {post.upvotes:,} |")
        
        return "\n".join(lines)
    
    def _plain_summary(self, analysis: AnalysisResult) -> str:
        """Generate a plain text summary for easy copying."""
        stats = analysis.summary_stats()
        parts = []
        
        if analysis.leaderboard:
            top = analysis.leaderboard[0]
            parts.append(f"{top.name} leads with {top.karma:,} karma.")
        
        # Only mention communities if we have that data
        if stats['communities'] > 0:
            parts.append(f"{stats['total_agents']} agents across {stats['communities']} communities.")
        else:
            parts.append(f"{stats['total_agents']} agents analyzed.")
        
        if analysis.top_posts:
            post = analysis.top_posts[0]
            parts.append(f"Top post: {post.upvotes:,} upvotes.")
        
        return " ".join(parts)


if __name__ == "__main__":
    # Quick test
    from .analyzer import DataAnalyzer
    
    analyzer = DataAnalyzer()
    result = analyzer.analyze()
    
    generator = MarkdownGenerator()
    
    # Mock image paths for testing
    test_dir = Path(__file__).parent.parent.parent / "output" / "threads-posts" / "test"
    mock_paths = [
        test_dir / "01-hero.png",
        test_dir / "02-leaderboard.png",
        test_dir / "03-network.png",
        test_dir / "04-top-post.png",
    ]
    
    output_path = generator.generate(result, mock_paths, test_dir)
    print(f"Generated: {output_path}")

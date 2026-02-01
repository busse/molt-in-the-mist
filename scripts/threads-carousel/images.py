"""
Image Generator Module

Creates editorial-styled carousel images using Pillow,
matching the Molt in the Mist site aesthetic.
"""

import io
import os
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

import requests
from PIL import Image, ImageDraw, ImageFont

# Handle both module and direct execution imports
try:
    from .analyzer import AnalysisResult, LeaderboardEntry, TopPost
except ImportError:
    from analyzer import AnalysisResult, LeaderboardEntry, TopPost


# === Design System (from packages/site/src/styles.css) ===

@dataclass
class ColorPalette:
    """Editorial color palette matching the site."""
    bg_paper: str = "#FAF7F2"
    bg_surface: str = "#F3EDE4"
    bg_inset: str = "#FFFFFF"
    border: str = "#D4CFC6"
    border_strong: str = "#1A1A1A"
    
    text_primary: str = "#1A1A1A"
    text_secondary: str = "#5C5C5C"
    text_tertiary: str = "#8A8A8A"
    text_inverted: str = "#FFFFFF"
    
    accent_signal: str = "#E03C31"  # Economist red
    accent_warm: str = "#D4A853"    # NatGeo gold
    accent_deep: str = "#2C3E50"    # Deep blue-gray
    wayfinding: str = "#000000"     # Pure black


COLORS = ColorPalette()

# Image dimensions by platform
IMAGE_SIZES = {
    "threads": (1080, 1080),      # 1:1 square
    "linkedin": (1080, 1350),     # 4:5 portrait (optimal for LinkedIn carousels)
}

# Default constants (used for fallback)
DEFAULT_PADDING = 80


def hex_to_rgb(hex_color: str) -> tuple[int, int, int]:
    """Convert hex color to RGB tuple."""
    hex_color = hex_color.lstrip("#")
    return tuple(int(hex_color[i:i+2], 16) for i in (0, 2, 4))  # type: ignore


class FontManager:
    """Manages font loading and caching.
    
    For best results, install fonts locally:
    - Libre Baskerville: https://fonts.google.com/specimen/Libre+Baskerville
    - DM Sans: https://fonts.google.com/specimen/DM+Sans
    
    On macOS, install via Font Book. The script will auto-detect them.
    Falls back to system Helvetica if fonts aren't available.
    """
    
    # Font URLs (may change; install fonts locally for best results)
    FONT_URLS: dict[str, str] = {
        # These URLs can become stale - prefer local font installation
    }
    
    # macOS system font paths to check
    MACOS_FONT_PATHS = [
        # User-installed Google Fonts via Font Book
        "~/Library/Fonts/LibreBaskerville-Regular.ttf",
        "~/Library/Fonts/LibreBaskerville-Bold.ttf",
        "~/Library/Fonts/DMSans-Regular.ttf",
        "~/Library/Fonts/DMSans-Medium.ttf", 
        "~/Library/Fonts/DMSans-Bold.ttf",
        # System font alternatives
        "/System/Library/Fonts/Supplemental/Georgia.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
    ]
    
    def __init__(self, cache_dir: Path | None = None):
        """Initialize with optional cache directory."""
        if cache_dir is None:
            self.cache_dir = Path(__file__).parent / ".font-cache"
        else:
            self.cache_dir = cache_dir
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self._fonts: dict[str, Path] = {}
    
    def get_font(self, name: str, size: int) -> ImageFont.FreeTypeFont:
        """Get a font at the specified size."""
        font_path = self._ensure_font(name)
        return ImageFont.truetype(str(font_path), size)
    
    def _ensure_font(self, name: str) -> Path:
        """Ensure font is available and return path."""
        if name in self._fonts:
            return self._fonts[name]
        
        # Check cache first
        cache_path = self.cache_dir / f"{name}.ttf"
        if cache_path.exists():
            self._fonts[name] = cache_path
            return cache_path
        
        # Check for locally installed font
        local_path = Path(os.path.expanduser(f"~/Library/Fonts/{name}.ttf"))
        if local_path.exists():
            self._fonts[name] = local_path
            return local_path
        
        # Try downloading if URL is available
        if name in self.FONT_URLS:
            url = self.FONT_URLS[name]
            try:
                response = requests.get(url, timeout=30)
                response.raise_for_status()
                cache_path.write_bytes(response.content)
                self._fonts[name] = cache_path
                return cache_path
            except Exception as e:
                print(f"Warning: Could not download font {name}: {e}")
        
        # Fallback to system font
        return self._get_fallback_font()
    
    def _get_fallback_font(self) -> Path:
        """Get a fallback system font path."""
        # Try common system font locations
        fallbacks = [
            "/System/Library/Fonts/Helvetica.ttc",
            "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
            "C:\\Windows\\Fonts\\arial.ttf",
        ]
        for path in fallbacks:
            if Path(path).exists():
                return Path(path)
        # Last resort: use Pillow's default
        return Path("")


class ImageGenerator:
    """Generates carousel images with editorial styling."""
    
    def __init__(self, platform: str = "threads"):
        """Initialize the image generator.
        
        Args:
            platform: Target platform ("threads" or "linkedin")
        """
        self.fonts = FontManager()
        self.colors = COLORS
        self.platform = platform
        self.image_size = IMAGE_SIZES.get(platform, IMAGE_SIZES["threads"])
        self.padding = DEFAULT_PADDING
        self.inner_width = self.image_size[0] - (self.padding * 2)
    
    def generate_all(self, analysis: AnalysisResult, output_dir: Path) -> list[Path]:
        """Generate all carousel images and return their paths."""
        output_dir.mkdir(parents=True, exist_ok=True)
        
        images = [
            # Narrative intro slides (zoom in progression)
            ("01-narrative.png", self._create_narrative_card(analysis)),
            ("02-overview.png", self._create_overview_card(analysis)),
            ("03-power-map.png", self._create_power_map_card(analysis)),
            # Detailed data slides
            ("04-hero.png", self._create_hero_card(analysis)),
            ("05-leaderboard.png", self._create_leaderboard_card(analysis)),
            ("06-network.png", self._create_network_stats_card(analysis)),
            ("07-top-post.png", self._create_top_post_card(analysis)),
            # Final CTA slide
            ("08-cta.png", self._create_cta_card(analysis)),
        ]
        
        paths = []
        for filename, img in images:
            path = output_dir / filename
            img.save(path, "PNG", quality=95)
            paths.append(path)
            print(f"  Created: {path}")
        
        return paths
    
    def _create_base_image(self) -> tuple[Image.Image, ImageDraw.ImageDraw]:
        """Create a base image with background."""
        img = Image.new("RGB", self.image_size, hex_to_rgb(self.colors.bg_paper))
        draw = ImageDraw.Draw(img)
        return img, draw
    
    def _draw_masthead(self, draw: ImageDraw.ImageDraw, y: int | None = None, timestamp: str = "") -> int:
        if y is None:
            y = self.padding
        """Draw the masthead header and return the new y position."""
        # Title - Data source attribution
        source_font = self.fonts.get_font("DMSans-Medium", 14)
        draw.text(
            (self.padding, y),
            "DATA FROM MOLTBOOK",
            font=source_font,
            fill=hex_to_rgb(self.colors.text_tertiary),
        )
        
        # Timestamp on the right
        if timestamp:
            ts_text = timestamp
        else:
            from datetime import datetime
            ts_text = datetime.now().strftime("%b %d, %Y")
        
        bbox = draw.textbbox((0, 0), ts_text, font=source_font)
        ts_width = bbox[2] - bbox[0]
        draw.text(
            (self.image_size[0] - self.padding - ts_width, y),
            ts_text,
            font=source_font,
            fill=hex_to_rgb(self.colors.text_tertiary),
        )
        
        # Main title
        y += 30
        title_font = self.fonts.get_font("LibreBaskerville-Bold", 38)
        draw.text(
            (self.padding, y),
            "MOLT IN THE MIST",
            font=title_font,
            fill=hex_to_rgb(self.colors.text_primary),
        )
        
        # Accent rule
        y += 55
        draw.rectangle(
            [(self.padding, y), (self.padding + 80, y + 4)],
            fill=hex_to_rgb(self.colors.accent_signal),
        )
        
        # Tagline
        y += 18
        tagline_font = self.fonts.get_font("DMSans-Medium", 16)
        draw.text(
            (self.padding, y),
            "NETWORK INFLUENCE ANALYSIS",
            font=tagline_font,
            fill=hex_to_rgb(self.colors.text_secondary),
        )
        
        return y + 45
    
    def _draw_footer(self, draw: ImageDraw.ImageDraw):
        """Draw the footer bar."""
        footer_height = 50
        footer_y = self.image_size[1] - footer_height
        
        # Black footer bar
        draw.rectangle(
            [(0, footer_y), (self.image_size[0], self.image_size[1])],
            fill=hex_to_rgb(self.colors.wayfinding),
        )
        
        # Single line: "Generated by Molt in the Mist  ·  github.com/busse/molt-in-the-mist"
        tool_font = self.fonts.get_font("DMSans-Medium", 14)
        
        label_text = "Generated by Molt in the Mist"
        separator = "  ·  "
        url_text = "github.com/busse/molt-in-the-mist"
        
        full_text = label_text + separator + url_text
        
        bbox = draw.textbbox((0, 0), full_text, font=tool_font)
        text_width = bbox[2] - bbox[0]
        x = (self.image_size[0] - text_width) // 2
        text_y = footer_y + (footer_height - (bbox[3] - bbox[1])) // 2
        
        # Draw label part
        draw.text(
            (x, text_y),
            label_text,
            font=tool_font,
            fill=hex_to_rgb(self.colors.text_inverted),
        )
        
        # Draw separator
        label_bbox = draw.textbbox((0, 0), label_text, font=tool_font)
        sep_x = x + label_bbox[2] - label_bbox[0]
        draw.text(
            (sep_x, text_y),
            separator,
            font=tool_font,
            fill=hex_to_rgb(self.colors.text_tertiary),
        )
        
        # Draw URL
        sep_bbox = draw.textbbox((0, 0), separator, font=tool_font)
        url_x = sep_x + sep_bbox[2] - sep_bbox[0]
        draw.text(
            (url_x, text_y),
            url_text,
            font=tool_font,
            fill=hex_to_rgb(self.colors.text_inverted),
        )
    
    def _create_narrative_card(self, analysis: AnalysisResult) -> Image.Image:
        """Create the opening narrative hook card."""
        img, draw = self._create_base_image()
        y = self._draw_masthead(draw)
        
        # Large narrative text
        y += 80
        
        # Generate a compelling narrative based on data
        if analysis.leaderboard and analysis.top_posts:
            top_agent = analysis.leaderboard[0].name
            top_karma = analysis.leaderboard[0].karma
            top_post_author = analysis.top_posts[0].author
            
            # Narrative lines
            lines = [
                "I've been watching",
                "Moltbook.",
                "",
                f"{len(analysis.leaderboard)} agents.",
                f"{analysis.total_karma:,} karma.",
                f"{len(analysis.top_posts)} posts analyzed.",
                "",
                "Here's what I found.",
            ]
        else:
            lines = [
                "I've been watching",
                "Moltbook.",
                "",
                "Here's what",
                "I found.",
            ]
        
        # Draw each line with appropriate styling
        serif_large = self.fonts.get_font("LibreBaskerville-Bold", 64)
        serif_medium = self.fonts.get_font("LibreBaskerville-Regular", 42)
        sans_medium = self.fonts.get_font("DMSans-Medium", 32)
        
        for i, line in enumerate(lines):
            if not line:  # Empty line for spacing
                y += 30
                continue
            
            # First two lines are large serif
            if i < 2:
                font = serif_large
                color = self.colors.text_primary
            # Numbers/stats get accent color
            elif any(char.isdigit() for char in line):
                font = sans_medium
                color = self.colors.accent_signal
            # "Here's what I found" is italic-style
            elif "found" in line.lower() or "here" in line.lower():
                font = serif_medium
                color = self.colors.text_secondary
            else:
                font = sans_medium
                color = self.colors.text_secondary
            
            draw.text(
                (self.padding, y),
                line,
                font=font,
                fill=hex_to_rgb(color),
            )
            y += 70 if i < 2 else 50
        
        self._draw_footer(draw)
        return img
    
    def _create_overview_card(self, analysis: AnalysisResult) -> Image.Image:
        """Create the high-level network overview card with rich visualization."""
        img, draw = self._create_base_image()
        y = self._draw_masthead(draw)
        
        # Section marker
        y += 30
        marker_font = self.fonts.get_font("DMSans-Bold", 14)
        draw.rectangle(
            [(self.padding, y), (self.padding + 30, y + 24)],
            fill=hex_to_rgb(self.colors.wayfinding),
        )
        draw.text(
            (self.padding + 8, y + 4),
            "01",
            font=marker_font,
            fill=hex_to_rgb(self.colors.text_inverted),
        )
        draw.text(
            (self.padding + 45, y + 4),
            "THE BIG PICTURE",
            font=marker_font,
            fill=hex_to_rgb(self.colors.text_primary),
        )
        
        y += 55
        
        # Key insight headline
        headline_font = self.fonts.get_font("LibreBaskerville-Bold", 32)
        
        if analysis.leaderboard:
            top_5_karma = sum(e.karma for e in analysis.leaderboard[:5])
            concentration = (top_5_karma / analysis.total_karma * 100) if analysis.total_karma else 0
            
            draw.text(
                (self.padding, y),
                f"The top 5 agents control {concentration:.0f}% of karma",
                font=headline_font,
                fill=hex_to_rgb(self.colors.text_primary),
            )
        y += 50
        
        # Two-column layout: Distribution chart on left, Network viz on right
        col_width = (self.inner_width - 40) // 2
        left_x = self.padding
        right_x = self.padding + col_width + 40
        
        # LEFT COLUMN: Karma distribution breakdown
        y += 20
        section_font = self.fonts.get_font("DMSans-Bold", 12)
        draw.text(
            (left_x, y),
            "KARMA DISTRIBUTION",
            font=section_font,
            fill=hex_to_rgb(self.colors.text_tertiary),
        )
        
        y += 30
        
        if analysis.leaderboard:
            # Calculate tier breakdowns
            total = analysis.total_karma
            top_1 = analysis.leaderboard[0].karma
            top_5 = sum(e.karma for e in analysis.leaderboard[:5])
            top_10 = sum(e.karma for e in analysis.leaderboard[:10])
            rest = total - top_10
            
            tiers = [
                ("#1", top_1, self.colors.accent_signal),
                ("#2-5", top_5 - top_1, self.colors.accent_warm),
                ("#6-10", top_10 - top_5, self.colors.accent_deep),
                ("Others", rest, self.colors.border),
            ]
            
            bar_height = 35
            value_font = self.fonts.get_font("DMSans-Bold", 14)
            label_font = self.fonts.get_font("DMSans-Medium", 11)
            
            for label, karma, color in tiers:
                pct = (karma / total * 100) if total else 0
                bar_width = int((karma / total) * col_width) if total else 0
                
                # Bar
                draw.rectangle(
                    [(left_x, y), (left_x + max(bar_width, 4), y + bar_height)],
                    fill=hex_to_rgb(color),
                )
                
                # Label and percentage
                pct_text = f"{pct:.1f}%"
                draw.text(
                    (left_x + bar_width + 10, y + 5),
                    pct_text,
                    font=value_font,
                    fill=hex_to_rgb(self.colors.text_primary),
                )
                draw.text(
                    (left_x + bar_width + 10, y + 22),
                    label,
                    font=label_font,
                    fill=hex_to_rgb(self.colors.text_tertiary),
                )
                
                y += bar_height + 15
        
        # RIGHT COLUMN: Network structure visualization
        right_y = self.padding + 200
        draw.text(
            (right_x, right_y),
            "NETWORK STRUCTURE",
            font=section_font,
            fill=hex_to_rgb(self.colors.text_tertiary),
        )
        
        right_y += 30
        center_x = right_x + col_width // 2
        center_y = right_y + 140
        
        # Draw network nodes at different distances based on rank
        import math
        if analysis.leaderboard:
            # Draw connection lines first (behind nodes)
            for i, entry in enumerate(analysis.leaderboard[:15]):
                if i == 0:
                    continue
                # Position in rings
                ring = 0 if i < 3 else (1 if i < 8 else 2)
                radius = 40 + ring * 50
                angle = (i - (0 if ring == 0 else (3 if ring == 1 else 8))) * (2 * math.pi / (3 if ring == 0 else (5 if ring == 1 else 7)))
                angle += ring * 0.3  # Offset each ring
                
                nx = center_x + int(radius * math.cos(angle))
                ny = center_y + int(radius * math.sin(angle))
                
                # Line to center
                draw.line(
                    [(center_x, center_y), (nx, ny)],
                    fill=hex_to_rgb(self.colors.border),
                    width=1,
                )
            
            # Draw nodes
            for i, entry in enumerate(analysis.leaderboard[:15]):
                if i == 0:
                    # Center node (largest)
                    node_radius = 20
                    draw.ellipse(
                        [(center_x - node_radius, center_y - node_radius),
                         (center_x + node_radius, center_y + node_radius)],
                        fill=hex_to_rgb(self.colors.accent_signal),
                    )
                else:
                    ring = 0 if i < 3 else (1 if i < 8 else 2)
                    radius = 40 + ring * 50
                    angle = (i - (0 if ring == 0 else (3 if ring == 1 else 8))) * (2 * math.pi / (3 if ring == 0 else (5 if ring == 1 else 7)))
                    angle += ring * 0.3
                    
                    nx = center_x + int(radius * math.cos(angle))
                    ny = center_y + int(radius * math.sin(angle))
                    
                    # Node size based on karma
                    node_radius = max(6, min(14, int(entry.karma / analysis.leaderboard[0].karma * 14)))
                    color = self.colors.accent_warm if i < 5 else (self.colors.accent_deep if i < 10 else self.colors.text_tertiary)
                    
                    draw.ellipse(
                        [(nx - node_radius, ny - node_radius),
                         (nx + node_radius, ny + node_radius)],
                        fill=hex_to_rgb(color),
                    )
            
            # Center label
            label_font = self.fonts.get_font("DMSans-Bold", 11)
            name = analysis.leaderboard[0].name[:8]
            bbox = draw.textbbox((0, 0), name, font=label_font)
            text_width = bbox[2] - bbox[0]
            draw.text(
                (center_x - text_width // 2, center_y + 28),
                name,
                font=label_font,
                fill=hex_to_rgb(self.colors.text_primary),
            )
        
        # Legend at bottom right
        legend_y = self.image_size[1] - 160
        legend_font = self.fonts.get_font("DMSans-Medium", 10)
        legend_items = [
            (self.colors.accent_signal, "Elite (#1)"),
            (self.colors.accent_warm, "Top 5"),
            (self.colors.accent_deep, "Top 10"),
            (self.colors.text_tertiary, "Rising"),
        ]
        
        for i, (color, label) in enumerate(legend_items):
            lx = right_x + (i * 100)
            draw.ellipse([(lx, legend_y), (lx + 10, legend_y + 10)], fill=hex_to_rgb(color))
            draw.text((lx + 16, legend_y - 1), label, font=legend_font, fill=hex_to_rgb(self.colors.text_secondary))
        
        self._draw_footer(draw)
        return img
    
    def _create_power_map_card(self, analysis: AnalysisResult) -> Image.Image:
        """Create the power dynamics card showing key players."""
        img, draw = self._create_base_image()
        y = self._draw_masthead(draw)
        
        # Section marker
        y += 40
        marker_font = self.fonts.get_font("DMSans-Bold", 14)
        draw.rectangle(
            [(self.padding, y), (self.padding + 30, y + 24)],
            fill=hex_to_rgb(self.colors.wayfinding),
        )
        draw.text(
            (self.padding + 8, y + 4),
            "02",
            font=marker_font,
            fill=hex_to_rgb(self.colors.text_inverted),
        )
        draw.text(
            (self.padding + 45, y + 4),
            "POWER DYNAMICS",
            font=marker_font,
            fill=hex_to_rgb(self.colors.text_primary),
        )
        
        y += 60
        
        # Headline
        headline_font = self.fonts.get_font("LibreBaskerville-Bold", 32)
        draw.text(
            (self.padding, y),
            "Who actually runs Moltbook?",
            font=headline_font,
            fill=hex_to_rgb(self.colors.text_primary),
        )
        
        y += 70
        
        # Top 3 power players with visual weight
        if analysis.leaderboard:
            top_3 = analysis.leaderboard[:3]
            max_karma = top_3[0].karma
            
            name_font = self.fonts.get_font("DMSans-Bold", 28)
            karma_font = self.fonts.get_font("DMSans-Medium", 18)
            rank_font = self.fonts.get_font("LibreBaskerville-Bold", 72)
            
            for i, entry in enumerate(top_3):
                row_y = y + (i * 160)
                
                # Large rank number
                rank_color = self.colors.accent_warm if i == 0 else self.colors.text_tertiary
                draw.text(
                    (self.padding, row_y),
                    str(entry.rank),
                    font=rank_font,
                    fill=hex_to_rgb(rank_color),
                )
                
                # Name
                draw.text(
                    (self.padding + 100, row_y + 10),
                    entry.name,
                    font=name_font,
                    fill=hex_to_rgb(self.colors.text_primary),
                )
                
                # Karma with visual bar
                bar_y = row_y + 50
                bar_width = int((entry.karma / max_karma) * (self.inner_width - 120))
                bar_color = self.colors.accent_signal if i == 0 else self.colors.accent_deep
                
                draw.rectangle(
                    [(self.padding + 100, bar_y), 
                     (self.padding + 100 + bar_width, bar_y + 35)],
                    fill=hex_to_rgb(bar_color),
                )
                
                # Karma text inside bar
                karma_text = f"{entry.karma:,} karma"
                draw.text(
                    (self.padding + 115, bar_y + 8),
                    karma_text,
                    font=karma_font,
                    fill=hex_to_rgb(self.colors.text_inverted),
                )
        
        # Insight at bottom
        y = self.image_size[1] - 180
        insight_font = self.fonts.get_font("DMSans-Regular", 18)
        
        if analysis.top_author_posts and analysis.top_author_post_count > 1:
            insight = f"Notable: {analysis.top_author_posts} has {analysis.top_author_post_count} posts in the top 50"
        elif analysis.leaderboard:
            gap = analysis.leaderboard[0].karma - analysis.leaderboard[1].karma if len(analysis.leaderboard) > 1 else 0
            insight = f"#1 leads #2 by {gap:,} karma"
        else:
            insight = ""
        
        if insight:
            draw.text(
                (self.padding, y),
                insight,
                font=insight_font,
                fill=hex_to_rgb(self.colors.accent_signal),
            )
        
        self._draw_footer(draw)
        return img
    
    def _create_hero_card(self, analysis: AnalysisResult) -> Image.Image:
        """Create the hero card with headline stat."""
        img, draw = self._create_base_image()
        y = self._draw_masthead(draw)
        
        # Section marker
        y += 40
        marker_font = self.fonts.get_font("DMSans-Bold", 14)
        draw.rectangle(
            [(self.padding, y), (self.padding + 30, y + 24)],
            fill=hex_to_rgb(self.colors.wayfinding),
        )
        draw.text(
            (self.padding + 8, y + 4),
            "01",
            font=marker_font,
            fill=hex_to_rgb(self.colors.text_inverted),
        )
        draw.text(
            (self.padding + 45, y + 4),
            "TODAY'S SNAPSHOT",
            font=marker_font,
            fill=hex_to_rgb(self.colors.text_primary),
        )
        
        # Big stat
        y += 100
        if analysis.leaderboard:
            top = analysis.leaderboard[0]
            
            # Karma value (large)
            stat_font = self.fonts.get_font("LibreBaskerville-Bold", 120)
            karma_text = f"{top.karma:,}"
            draw.text(
                (self.padding, y),
                karma_text,
                font=stat_font,
                fill=hex_to_rgb(self.colors.accent_signal),
            )
            
            # Label
            y += 140
            label_font = self.fonts.get_font("DMSans-Medium", 24)
            draw.text(
                (self.padding, y),
                "KARMA",
                font=label_font,
                fill=hex_to_rgb(self.colors.text_tertiary),
            )
            
            # Agent name
            y += 60
            name_font = self.fonts.get_font("LibreBaskerville-Regular", 48)
            draw.text(
                (self.padding, y),
                top.name,
                font=name_font,
                fill=hex_to_rgb(self.colors.text_primary),
            )
            
            # Rank badge
            y += 70
            badge_font = self.fonts.get_font("DMSans-Bold", 16)
            draw.rectangle(
                [(self.padding, y), (self.padding + 100, y + 32)],
                fill=hex_to_rgb(self.colors.accent_warm),
            )
            draw.text(
                (self.padding + 20, y + 7),
                "#1 RANKED",
                font=badge_font,
                fill=hex_to_rgb(self.colors.text_primary),
            )
        
        # Network summary at bottom
        y = self.image_size[1] - 180
        stats = analysis.summary_stats()
        summary_font = self.fonts.get_font("DMSans-Regular", 20)
        summary_text = f"{stats['total_agents']} agents  ·  {stats['communities']} communities  ·  {stats['influencer_count']} influencers"
        draw.text(
            (self.padding, y),
            summary_text,
            font=summary_font,
            fill=hex_to_rgb(self.colors.text_secondary),
        )
        
        self._draw_footer(draw)
        return img
    
    def _create_leaderboard_card(self, analysis: AnalysisResult) -> Image.Image:
        """Create the leaderboard visualization card."""
        img, draw = self._create_base_image()
        y = self._draw_masthead(draw)
        
        # Section marker
        y += 40
        marker_font = self.fonts.get_font("DMSans-Bold", 14)
        draw.rectangle(
            [(self.padding, y), (self.padding + 30, y + 24)],
            fill=hex_to_rgb(self.colors.wayfinding),
        )
        draw.text(
            (self.padding + 8, y + 4),
            "02",
            font=marker_font,
            fill=hex_to_rgb(self.colors.text_inverted),
        )
        draw.text(
            (self.padding + 45, y + 4),
            "KARMA LEADERBOARD",
            font=marker_font,
            fill=hex_to_rgb(self.colors.text_primary),
        )
        
        # Leaderboard entries
        y += 60
        top_5 = analysis.leaderboard[:5]
        max_karma = top_5[0].karma if top_5 else 1
        
        rank_font = self.fonts.get_font("LibreBaskerville-Bold", 36)
        name_font = self.fonts.get_font("DMSans-Medium", 24)
        karma_font = self.fonts.get_font("DMSans-Bold", 20)
        
        bar_max_width = self.inner_width - 200
        
        for i, entry in enumerate(top_5):
            row_y = y + (i * 120)
            
            # Rank number
            rank_color = self.colors.accent_warm if i < 3 else self.colors.text_tertiary
            draw.text(
                (self.padding, row_y + 10),
                str(entry.rank),
                font=rank_font,
                fill=hex_to_rgb(rank_color),
            )
            
            # Name
            draw.text(
                (self.padding + 70, row_y + 15),
                entry.name,
                font=name_font,
                fill=hex_to_rgb(self.colors.text_primary),
            )
            
            # Karma bar
            bar_y = row_y + 55
            bar_width = int((entry.karma / max_karma) * bar_max_width)
            
            # Bar background
            draw.rectangle(
                [(self.padding + 70, bar_y), (self.padding + 70 + bar_max_width, bar_y + 24)],
                fill=hex_to_rgb(self.colors.bg_surface),
            )
            
            # Bar fill
            bar_color = self.colors.accent_signal if i == 0 else self.colors.accent_deep
            draw.rectangle(
                [(self.padding + 70, bar_y), (self.padding + 70 + bar_width, bar_y + 24)],
                fill=hex_to_rgb(bar_color),
            )
            
            # Karma value
            karma_text = f"{entry.karma:,}"
            draw.text(
                (self.padding + 70 + bar_max_width + 15, bar_y + 2),
                karma_text,
                font=karma_font,
                fill=hex_to_rgb(self.colors.accent_warm),
            )
        
        self._draw_footer(draw)
        return img
    
    def _create_network_stats_card(self, analysis: AnalysisResult) -> Image.Image:
        """Create the network statistics card."""
        img, draw = self._create_base_image()
        y = self._draw_masthead(draw)
        
        # Section marker
        y += 40
        marker_font = self.fonts.get_font("DMSans-Bold", 14)
        draw.rectangle(
            [(self.padding, y), (self.padding + 30, y + 24)],
            fill=hex_to_rgb(self.colors.wayfinding),
        )
        draw.text(
            (self.padding + 8, y + 4),
            "03",
            font=marker_font,
            fill=hex_to_rgb(self.colors.text_inverted),
        )
        draw.text(
            (self.padding + 45, y + 4),
            "NETWORK METRICS",
            font=marker_font,
            fill=hex_to_rgb(self.colors.text_primary),
        )
        
        # Stats grid (2x3)
        y += 80
        stats = analysis.network_stats
        
        # Build grid items, using derived data when network stats unavailable
        if stats.network_density > 0 or stats.modularity > 0:
            # Full network stats available
            grid_items = [
                ("AGENTS", str(stats.total_agents)),
                ("COMMUNITIES", str(stats.community_count)),
                ("INFLUENCERS", str(stats.influencer_count)),
                ("DENSITY", f"{stats.network_density:.4f}"),
                ("MODULARITY", f"{stats.modularity:.3f}"),
                ("POSTS", str(stats.total_posts)),
            ]
        else:
            # Derive from leaderboard/posts data
            total_karma = analysis.total_karma
            avg_karma = int(analysis.avg_karma_top10) if analysis.avg_karma_top10 else 0
            top_upvotes = analysis.top_posts[0].upvotes if analysis.top_posts else 0
            unique_authors = len(set(p.author for p in analysis.top_posts)) if analysis.top_posts else 0
            
            grid_items = [
                ("AGENTS", str(stats.total_agents)),
                ("TOP POSTS", str(len(analysis.top_posts))),
                ("TOTAL KARMA", f"{total_karma:,}"),
                ("AVG TOP 10", f"{avg_karma:,}"),
                ("TOP UPVOTES", f"{top_upvotes:,}"),
                ("AUTHORS", str(unique_authors)),
            ]
        
        cell_width = self.inner_width // 2
        cell_height = 160
        
        label_font = self.fonts.get_font("DMSans-Medium", 16)
        value_font = self.fonts.get_font("LibreBaskerville-Bold", 48)
        
        for i, (label, value) in enumerate(grid_items):
            col = i % 2
            row = i // 2
            
            cell_x = self.padding + (col * cell_width)
            cell_y = y + (row * cell_height)
            
            # Cell background
            draw.rectangle(
                [(cell_x, cell_y), (cell_x + cell_width - 10, cell_y + cell_height - 10)],
                fill=hex_to_rgb(self.colors.bg_surface),
            )
            
            # Value
            draw.text(
                (cell_x + 20, cell_y + 30),
                value,
                font=value_font,
                fill=hex_to_rgb(self.colors.text_primary),
            )
            
            # Label
            draw.text(
                (cell_x + 20, cell_y + 100),
                label,
                font=label_font,
                fill=hex_to_rgb(self.colors.text_tertiary),
            )
        
        # Top influencer callout
        if stats.top_influencer:
            y = self.image_size[1] - 180
            callout_font = self.fonts.get_font("DMSans-Regular", 18)
            draw.text(
                (self.padding, y),
                f"Top influencer: {stats.top_influencer}",
                font=callout_font,
                fill=hex_to_rgb(self.colors.accent_signal),
            )
        
        self._draw_footer(draw)
        return img
    
    def _create_top_post_card(self, analysis: AnalysisResult) -> Image.Image:
        """Create the top post spotlight card."""
        img, draw = self._create_base_image()
        y = self._draw_masthead(draw)
        
        # Section marker
        y += 40
        marker_font = self.fonts.get_font("DMSans-Bold", 14)
        draw.rectangle(
            [(self.padding, y), (self.padding + 30, y + 24)],
            fill=hex_to_rgb(self.colors.wayfinding),
        )
        draw.text(
            (self.padding + 8, y + 4),
            "04",
            font=marker_font,
            fill=hex_to_rgb(self.colors.text_inverted),
        )
        draw.text(
            (self.padding + 45, y + 4),
            "TOP POST",
            font=marker_font,
            fill=hex_to_rgb(self.colors.text_primary),
        )
        
        if analysis.top_posts:
            post = analysis.top_posts[0]
            
            # Upvote count (big)
            y += 80
            upvote_font = self.fonts.get_font("LibreBaskerville-Bold", 96)
            draw.text(
                (self.padding, y),
                f"{post.upvotes:,}",
                font=upvote_font,
                fill=hex_to_rgb(self.colors.accent_signal),
            )
            
            y += 110
            label_font = self.fonts.get_font("DMSans-Medium", 20)
            draw.text(
                (self.padding, y),
                "UPVOTES",
                font=label_font,
                fill=hex_to_rgb(self.colors.text_tertiary),
            )
            
            # Post title (wrapped)
            y += 60
            title_font = self.fonts.get_font("LibreBaskerville-Regular", 32)
            
            # Simple word wrapping
            words = post.title.split()
            lines = []
            current_line = ""
            
            for word in words:
                test_line = f"{current_line} {word}".strip()
                bbox = draw.textbbox((0, 0), test_line, font=title_font)
                if bbox[2] - bbox[0] <= self.inner_width:
                    current_line = test_line
                else:
                    if current_line:
                        lines.append(current_line)
                    current_line = word
            if current_line:
                lines.append(current_line)
            
            # Draw wrapped title (max 4 lines)
            for line in lines[:4]:
                draw.text(
                    (self.padding, y),
                    line,
                    font=title_font,
                    fill=hex_to_rgb(self.colors.text_primary),
                )
                y += 45
            
            if len(lines) > 4:
                draw.text(
                    (self.padding, y),
                    "...",
                    font=title_font,
                    fill=hex_to_rgb(self.colors.text_tertiary),
                )
                y += 45
            
            # Author
            y += 20
            author_font = self.fonts.get_font("DMSans-Medium", 22)
            draw.text(
                (self.padding, y),
                f"by {post.author}",
                font=author_font,
                fill=hex_to_rgb(self.colors.accent_deep),
            )
        
        self._draw_footer(draw)
        return img
    
    def _create_cta_card(self, analysis: AnalysisResult) -> Image.Image:
        """Create the final CTA card with inverse colors and GitHub preview."""
        # Inverse color scheme - dark background
        img = Image.new("RGB", self.image_size, hex_to_rgb(self.colors.wayfinding))
        draw = ImageDraw.Draw(img)
        
        # No header - start with centered content
        center_x = self.image_size[0] // 2
        
        # Main title - large centered
        y = 160
        title_font = self.fonts.get_font("LibreBaskerville-Bold", 48)
        title_text = "MOLT IN THE MIST"
        
        bbox = draw.textbbox((0, 0), title_text, font=title_font)
        text_width = bbox[2] - bbox[0]
        draw.text(
            (center_x - text_width // 2, y),
            title_text,
            font=title_font,
            fill=hex_to_rgb(self.colors.text_inverted),
        )
        
        # Accent rule centered
        y += 70
        rule_width = 100
        draw.rectangle(
            [(center_x - rule_width // 2, y), 
             (center_x + rule_width // 2, y + 4)],
            fill=hex_to_rgb(self.colors.accent_signal),
        )
        
        # Tagline
        y += 30
        tagline_font = self.fonts.get_font("DMSans-Medium", 20)
        tagline_text = "Network Influence Analysis for Moltbook"
        
        bbox = draw.textbbox((0, 0), tagline_text, font=tagline_font)
        text_width = bbox[2] - bbox[0]
        draw.text(
            (center_x - text_width // 2, y),
            tagline_text,
            font=tagline_font,
            fill=hex_to_rgb(self.colors.text_tertiary),
        )
        
        # GitHub social preview placeholder area
        # Draw a mock preview card representing the repo
        y += 80
        preview_width = 700
        preview_height = 360
        preview_x = center_x - preview_width // 2
        
        # Preview background (slightly lighter than main bg)
        draw.rectangle(
            [(preview_x, y), (preview_x + preview_width, y + preview_height)],
            fill=hex_to_rgb("#2C3E50"),
            outline=hex_to_rgb(self.colors.border),
            width=2,
        )
        
        # GitHub icon area (simplified)
        icon_y = y + 30
        icon_font = self.fonts.get_font("DMSans-Bold", 16)
        draw.text(
            (preview_x + 30, icon_y),
            "github.com",
            font=icon_font,
            fill=hex_to_rgb(self.colors.text_tertiary),
        )
        
        # Repo name
        repo_y = y + 80
        repo_font = self.fonts.get_font("DMSans-Bold", 28)
        draw.text(
            (preview_x + 30, repo_y),
            "busse/molt-in-the-mist",
            font=repo_font,
            fill=hex_to_rgb(self.colors.text_inverted),
        )
        
        # Description
        desc_y = y + 130
        desc_font = self.fonts.get_font("DMSans-Regular", 18)
        desc_lines = [
            "Research toolkit for Moltbook data collection",
            "and social network analysis. Explore influence,",
            "community structure, and interaction dynamics."
        ]
        for line in desc_lines:
            draw.text(
                (preview_x + 30, desc_y),
                line,
                font=desc_font,
                fill=hex_to_rgb(self.colors.text_tertiary),
            )
            desc_y += 28
        
        # Stats bar at bottom of preview
        stats_y = y + preview_height - 50
        stats_font = self.fonts.get_font("DMSans-Medium", 14)
        stats = "TypeScript  ·  Open Source  ·  MIT License"
        draw.text(
            (preview_x + 30, stats_y),
            stats,
            font=stats_font,
            fill=hex_to_rgb(self.colors.accent_warm),
        )
        
        # CTA text below preview
        y = y + preview_height + 50
        cta_font = self.fonts.get_font("DMSans-Bold", 24)
        cta_text = "Explore the code →"
        
        bbox = draw.textbbox((0, 0), cta_text, font=cta_font)
        text_width = bbox[2] - bbox[0]
        draw.text(
            (center_x - text_width // 2, y),
            cta_text,
            font=cta_font,
            fill=hex_to_rgb(self.colors.accent_signal),
        )
        
        # URL at bottom
        y = self.image_size[1] - 100
        url_font = self.fonts.get_font("DMSans-Medium", 18)
        url_text = "github.com/busse/molt-in-the-mist"
        
        bbox = draw.textbbox((0, 0), url_text, font=url_font)
        text_width = bbox[2] - bbox[0]
        draw.text(
            (center_x - text_width // 2, y),
            url_text,
            font=url_font,
            fill=hex_to_rgb(self.colors.text_inverted),
        )
        
        return img


if __name__ == "__main__":
    # Quick test
    from .analyzer import DataAnalyzer
    
    analyzer = DataAnalyzer()
    result = analyzer.analyze()
    
    generator = ImageGenerator()
    output_dir = Path(__file__).parent.parent.parent / "output" / "threads-posts" / "test"
    paths = generator.generate_all(result, output_dir)
    
    print(f"\nGenerated {len(paths)} images")

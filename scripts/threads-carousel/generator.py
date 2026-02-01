#!/usr/bin/env python3
"""
Social Carousel Generator

Main entry point for generating carousel posts for Threads and LinkedIn
with editorial-styled images and markdown documentation.

Usage:
    python scripts/threads-carousel/generator.py
    python scripts/threads-carousel/generator.py --headline "Custom headline"
    python scripts/threads-carousel/generator.py --output-dir ./my-output
"""

import argparse
import sys
from datetime import datetime
from pathlib import Path

# Add package directory to path for imports when run directly
_package_dir = Path(__file__).parent
if str(_package_dir) not in sys.path:
    sys.path.insert(0, str(_package_dir))

from analyzer import DataAnalyzer
from images import ImageGenerator, IMAGE_SIZES
from templates import MarkdownGenerator

# Platforms to generate
PLATFORMS = ["threads", "linkedin"]


def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description="Generate social media carousel posts from Moltbook data",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
    # Generate with auto-generated headline
    python scripts/threads-carousel/generator.py
    
    # Generate with custom headline
    python scripts/threads-carousel/generator.py --headline "Who runs Moltbook?"
    
    # Specify custom output directory
    python scripts/threads-carousel/generator.py --output-dir ./my-posts
    
    # Specify custom data directory
    python scripts/threads-carousel/generator.py --data-dir ./my-data
    
    # Generate for specific platform only
    python scripts/threads-carousel/generator.py --platform threads
""",
    )
    
    parser.add_argument(
        "--headline",
        type=str,
        default=None,
        help="Custom headline for the post (auto-generated if not provided)",
    )
    
    parser.add_argument(
        "--output-dir",
        type=str,
        default=None,
        help="Output directory (default: output/threads-posts/{timestamp})",
    )
    
    parser.add_argument(
        "--data-dir",
        type=str,
        default=None,
        help="Data directory containing JSON files (default: data/)",
    )
    
    parser.add_argument(
        "--platform",
        type=str,
        choices=PLATFORMS + ["all"],
        default="all",
        help="Platform to generate for (default: all)",
    )
    
    parser.add_argument(
        "--skip-images",
        action="store_true",
        help="Skip image generation (useful for testing markdown only)",
    )
    
    parser.add_argument(
        "--verbose",
        "-v",
        action="store_true",
        help="Enable verbose output",
    )
    
    args = parser.parse_args()
    
    print()
    print("🦞 Molt in the Mist — Social Carousel Generator")
    print("=" * 50)
    print()
    
    # Determine output directory with timestamp
    if args.output_dir:
        output_base = Path(args.output_dir)
    else:
        timestamp_str = datetime.now().strftime("%Y-%m-%d-%H%M%S")
        output_base = (
            Path(__file__).parent.parent.parent 
            / "output" 
            / "threads-posts" 
            / timestamp_str
        )
    
    output_base.mkdir(parents=True, exist_ok=True)
    print(f"📁 Output directory: {output_base}")
    print()
    
    # Determine which platforms to generate
    platforms_to_generate = PLATFORMS if args.platform == "all" else [args.platform]
    
    # Display platform info
    print(f"📱 Platforms: {', '.join(platforms_to_generate)}")
    for platform in platforms_to_generate:
        size = IMAGE_SIZES[platform]
        print(f"   {platform}: {size[0]}×{size[1]} px")
    print()
    
    # Step 1: Analyze data
    print("📊 Analyzing Moltbook data...")
    data_dir = Path(args.data_dir) if args.data_dir else None
    analyzer = DataAnalyzer(data_dir=data_dir)
    
    try:
        analysis = analyzer.analyze()
    except Exception as e:
        print(f"❌ Error analyzing data: {e}")
        print()
        print("Make sure you have collected data by running:")
        print("  pnpm collect")
        print("  pnpm analyze")
        sys.exit(1)
    
    if args.verbose:
        print(f"   Leaderboard entries: {len(analysis.leaderboard)}")
        print(f"   Top posts: {len(analysis.top_posts)}")
        print(f"   Communities: {len(analysis.communities)}")
    
    if not analysis.leaderboard:
        print("⚠️  Warning: No leaderboard data found")
    if not analysis.top_posts:
        print("⚠️  Warning: No top posts data found")
    
    print("   ✓ Analysis complete")
    print()
    
    # Step 2: Generate images for each platform
    all_image_paths = {}
    
    if not args.skip_images:
        print("🎨 Generating carousel images...")
        
        for platform in platforms_to_generate:
            platform_dir = output_base / platform
            platform_dir.mkdir(parents=True, exist_ok=True)
            
            size = IMAGE_SIZES[platform]
            print(f"\n   📐 {platform.upper()} ({size[0]}×{size[1]}):")
            
            image_gen = ImageGenerator(platform=platform)
            
            try:
                image_paths = image_gen.generate_all(analysis, platform_dir)
                all_image_paths[platform] = image_paths
                print(f"      ✓ Generated {len(image_paths)} images")
            except Exception as e:
                print(f"❌ Error generating {platform} images: {e}")
                print()
                print("Make sure Pillow is installed:")
                print("  pip install Pillow")
                sys.exit(1)
        print()
    else:
        print("⏭️  Skipping image generation")
        # Create placeholder paths for markdown (use threads as default)
        placeholder_paths = [
            output_base / "threads" / "01-narrative.png",
            output_base / "threads" / "02-overview.png",
            output_base / "threads" / "03-power-map.png",
            output_base / "threads" / "04-hero.png",
            output_base / "threads" / "05-leaderboard.png",
            output_base / "threads" / "06-network.png",
            output_base / "threads" / "07-top-post.png",
            output_base / "threads" / "08-cta.png",
        ]
        all_image_paths["threads"] = placeholder_paths
        print()
    
    # Step 3: Generate markdown for each platform
    print("📝 Generating markdown documents...")
    md_gen = MarkdownGenerator()
    
    for platform, image_paths in all_image_paths.items():
        platform_dir = output_base / platform
        size = IMAGE_SIZES.get(platform, IMAGE_SIZES["threads"])
        
        try:
            md_path = md_gen.generate(
                analysis=analysis,
                image_paths=image_paths,
                output_dir=platform_dir,
                headline=args.headline,
                platform=platform,
            )
            print(f"   ✓ Generated: {platform}/post.md")
        except Exception as e:
            print(f"❌ Error generating {platform} markdown: {e}")
            sys.exit(1)
    
    print()
    print("=" * 50)
    print("✅ Generation complete!")
    print()
    print("📂 Output structure:")
    print(f"   {output_base}/")
    
    for platform in platforms_to_generate:
        size = IMAGE_SIZES[platform]
        print(f"   └── {platform}/ ({size[0]}×{size[1]})")
        if platform in all_image_paths:
            for path in all_image_paths[platform][:3]:
                exists = "✓" if path.exists() else "○"
                print(f"       {exists} {path.name}")
            if len(all_image_paths[platform]) > 3:
                print(f"       ... and {len(all_image_paths[platform]) - 3} more")
        print(f"       ✓ post.md")
    
    print()
    print("📋 Next steps:")
    print(f"   1. Review posts in {output_base}")
    print("   2. Copy headline and summary to your platform")
    print("   3. Upload the carousel images in order")
    print()


if __name__ == "__main__":
    main()

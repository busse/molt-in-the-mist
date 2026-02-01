"""
Data Analyzer Module

Reads Moltbook JSON data and computes insights for carousel posts.
"""

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


@dataclass
class LeaderboardEntry:
    """A single leaderboard entry."""
    name: str
    karma: int
    rank: int


@dataclass
class TopPost:
    """A top-performing post."""
    id: str
    title: str
    author: str
    upvotes: int


@dataclass
class NetworkStats:
    """Network-level statistics."""
    total_agents: int = 0
    total_posts: int = 0
    total_comments: int = 0
    network_density: float = 0.0
    community_count: int = 0
    modularity: float = 0.0
    influencer_count: int = 0
    top_influencer: str = ""
    avg_influence_score: float = 0.0
    collected_at: str = ""


@dataclass
class CommunityInfo:
    """Community information."""
    id: int
    name: str
    size: int
    top_agents: list[str] = field(default_factory=list)


@dataclass
class AnalysisResult:
    """Complete analysis result for carousel generation."""
    leaderboard: list[LeaderboardEntry]
    top_posts: list[TopPost]
    network_stats: NetworkStats
    communities: list[CommunityInfo]
    
    # Computed insights
    total_karma: int = 0
    avg_karma_top10: float = 0.0
    top_author_posts: str = ""
    top_author_post_count: int = 0
    
    def headline_stat(self) -> str:
        """Generate a compelling headline stat."""
        if self.leaderboard:
            top = self.leaderboard[0]
            return f"{top.name} leads with {top.karma:,} karma"
        return "Moltbook network analysis"
    
    def summary_stats(self) -> dict[str, Any]:
        """Return key stats for the summary."""
        return {
            "top_agent": self.leaderboard[0].name if self.leaderboard else "N/A",
            "top_karma": self.leaderboard[0].karma if self.leaderboard else 0,
            "total_agents": self.network_stats.total_agents,
            "communities": self.network_stats.community_count,
            "top_post_title": self.top_posts[0].title if self.top_posts else "N/A",
            "top_post_upvotes": self.top_posts[0].upvotes if self.top_posts else 0,
            "influencer_count": self.network_stats.influencer_count,
        }


class DataAnalyzer:
    """Analyzes Moltbook data from JSON files."""
    
    def __init__(self, data_dir: Path | None = None):
        """Initialize with data directory path."""
        if data_dir is None:
            # Default to project's data directory
            self.data_dir = Path(__file__).parent.parent.parent / "data"
        else:
            self.data_dir = Path(data_dir)
        
        self.site_data_dir = (
            Path(__file__).parent.parent.parent 
            / "packages" / "site" / "public" / "data"
        )
    
    def analyze(self) -> AnalysisResult:
        """Run full analysis and return results."""
        leaderboard = self._load_leaderboard()
        top_posts = self._load_top_posts()
        network_stats, communities = self._load_visualization_data()
        
        # If network stats are empty, derive from available data
        if network_stats.total_agents == 0 and leaderboard:
            network_stats.total_agents = len(leaderboard)
        if network_stats.total_posts == 0 and top_posts:
            network_stats.total_posts = len(top_posts)
        
        result = AnalysisResult(
            leaderboard=leaderboard,
            top_posts=top_posts,
            network_stats=network_stats,
            communities=communities,
        )
        
        # Compute derived insights
        if leaderboard:
            result.total_karma = sum(e.karma for e in leaderboard)
            top_10 = leaderboard[:10]
            result.avg_karma_top10 = (
                sum(e.karma for e in top_10) / len(top_10) if top_10 else 0
            )
            
            # Estimate influencers as top 10% or those with karma > average
            if len(leaderboard) >= 10:
                network_stats.influencer_count = max(
                    len(leaderboard) // 10,
                    len([e for e in leaderboard if e.karma > result.avg_karma_top10])
                )
            
            # Set top influencer
            if not network_stats.top_influencer:
                network_stats.top_influencer = leaderboard[0].name
        
        # Find most prolific author in top posts
        if top_posts:
            author_counts: dict[str, int] = {}
            for post in top_posts:
                author_counts[post.author] = author_counts.get(post.author, 0) + 1
            if author_counts:
                top_author = max(author_counts.items(), key=lambda x: x[1])
                result.top_author_posts = top_author[0]
                result.top_author_post_count = top_author[1]
        
        return result
    
    def _load_leaderboard(self) -> list[LeaderboardEntry]:
        """Load leaderboard data."""
        leaderboard_path = self.data_dir / "moltbook-leaderboard.json"
        
        if not leaderboard_path.exists():
            return []
        
        with open(leaderboard_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        
        return [
            LeaderboardEntry(
                name=entry.get("name", ""),
                karma=entry.get("karma", 0),
                rank=entry.get("rank", 0),
            )
            for entry in data
        ]
    
    def _load_top_posts(self) -> list[TopPost]:
        """Load top posts data."""
        top_posts_path = self.data_dir / "moltbook-top-posts.json"
        
        if not top_posts_path.exists():
            return []
        
        with open(top_posts_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        
        return [
            TopPost(
                id=entry.get("id", ""),
                title=entry.get("title", ""),
                author=entry.get("author", ""),
                upvotes=entry.get("upvotes", 0),
            )
            for entry in data
        ]
    
    def _load_visualization_data(self) -> tuple[NetworkStats, list[CommunityInfo]]:
        """Load visualization data for network stats."""
        vis_path = self.site_data_dir / "visualization.json"
        
        stats = NetworkStats()
        communities: list[CommunityInfo] = []
        
        if not vis_path.exists():
            return stats, communities
        
        with open(vis_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        
        # Extract metadata
        metadata = data.get("metadata", {})
        stats = NetworkStats(
            total_agents=metadata.get("total_agents", 0),
            total_posts=metadata.get("total_posts", 0),
            total_comments=metadata.get("total_comments", 0),
            network_density=metadata.get("network_density", 0.0),
            community_count=metadata.get("community_count", 0),
            modularity=metadata.get("modularity", 0.0),
            influencer_count=metadata.get("influencer_count", 0),
            top_influencer=metadata.get("top_influencer", ""),
            avg_influence_score=metadata.get("avg_influence_score", 0.0),
            collected_at=metadata.get("collected_at", ""),
        )
        
        # Extract communities
        for comm in data.get("communities", []):
            communities.append(CommunityInfo(
                id=comm.get("id", 0),
                name=comm.get("name", f"Community {comm.get('id', 0)}"),
                size=comm.get("size", 0),
                top_agents=comm.get("top_agents", [])[:5],
            ))
        
        return stats, communities


if __name__ == "__main__":
    # Quick test
    analyzer = DataAnalyzer()
    result = analyzer.analyze()
    
    print("=== Analysis Results ===")
    print(f"Leaderboard entries: {len(result.leaderboard)}")
    print(f"Top posts: {len(result.top_posts)}")
    print(f"Headline stat: {result.headline_stat()}")
    print(f"Summary stats: {result.summary_stats()}")

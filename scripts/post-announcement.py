#!/usr/bin/env python3
"""
MoltInTheMist Announcement Poster

This script posts an announcement to Moltbook using the configured API key.

USAGE:
    1. Set your MOLTBOOK_API_KEY environment variable
    2. Review the post content in content/inaugural-post.md
    3. Change DRY_RUN to False below (see SAFETY FLAG section)
    4. Run: python scripts/post-announcement.py

SAFETY:
    This script will NOT post anything until you manually change DRY_RUN to False.
"""

import os
import sys
import json
import requests
import time
from pathlib import Path

# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║                                                                              ║
# ║   🚨 SAFETY FLAG - MUST BE CHANGED BY A HUMAN TO ACTUALLY POST 🚨           ║
# ║                                                                              ║
# ║   Set DRY_RUN = False to actually send the post to Moltbook.                 ║
# ║   When True (default), the script only prints what WOULD be sent.           ║
# ║                                                                              ║
# ╚══════════════════════════════════════════════════════════════════════════════╝

DRY_RUN = False  # <-- CHANGE TO False TO ACTUALLY POST (after reviewing content)

# ════════════════════════════════════════════════════════════════════════════════


# Configuration
MOLTBOOK_API_BASE = "https://www.moltbook.com/api/v1"
POST_ENDPOINT = f"{MOLTBOOK_API_BASE}/posts"
CONTENT_FILE = Path(__file__).parent.parent / "content" / "inaugural-post.md"

# Post metadata
POST_TITLE = "I've been watching. Here's who actually runs Moltbook."
POST_SUBMOLT = "general"  # or "announcement" if you have access


def load_api_key() -> str:
    """Load API key from environment variable."""
    api_key = os.environ.get("MOLTBOOK_API_KEY")
    if not api_key:
        print("❌ Error: MOLTBOOK_API_KEY environment variable not set.")
        print("")
        print("   Set it with:")
        print("   export MOLTBOOK_API_KEY='your-api-key-here'")
        print("")
        sys.exit(1)
    return api_key


def load_post_content() -> str:
    """Load post content from markdown file."""
    if not CONTENT_FILE.exists():
        print(f"❌ Error: Content file not found: {CONTENT_FILE}")
        sys.exit(1)
    
    content = CONTENT_FILE.read_text(encoding="utf-8")
    
    # Strip the H1 title from content (we pass it separately)
    lines = content.split("\n")
    if lines and lines[0].startswith("# "):
        lines = lines[1:]  # Remove the title line
        # Also remove any blank lines immediately after
        while lines and not lines[0].strip():
            lines = lines[1:]
    
    return "\n".join(lines)


def preview_post(title: str, content: str, submolt: str):
    """Print a preview of what would be posted."""
    print("=" * 70)
    print("📋 POST PREVIEW")
    print("=" * 70)
    print(f"Title:   {title}")
    print(f"Submolt: m/{submolt}")
    print("-" * 70)
    print("Content (first 500 chars):")
    print(content[:500])
    if len(content) > 500:
        print(f"... [{len(content) - 500} more characters]")
    print("-" * 70)
    print(f"Total content length: {len(content)} characters")
    print("=" * 70)


def post_to_moltbook(
    api_key: str,
    title: str,
    content: str,
    submolt: str,
    *,
    attempts: int = 3,
    base_delay_seconds: float = 1.5,
) -> dict:
    """Send the post to Moltbook API with basic retry/backoff."""
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }
    
    payload = {
        "title": title,
        "content": content,
        "submolt": submolt,
    }
    
    last_error: Exception | None = None

    for attempt in range(1, attempts + 1):
        try:
            response = requests.post(
                POST_ENDPOINT,
                headers=headers,
                json=payload,
                timeout=30,
            )
            if response.status_code >= 400:
                # Provide context to help diagnose server errors.
                print("")
                print(f"❌ HTTP Error: {response.status_code} {response.reason}")
                if response.text:
                    print(f"   Response: {response.text}")
                else:
                    print("   Response: No response")
                response.raise_for_status()

            return response.json()
        except requests.exceptions.RequestException as e:
            last_error = e
            if attempt < attempts:
                delay = base_delay_seconds * attempt
                print("")
                print(f"⚠️  Request failed (attempt {attempt}/{attempts}). Retrying in {delay:.1f}s...")
                time.sleep(delay)
            else:
                raise

    # Defensive fallback (should never hit)
    if last_error:
        raise last_error
    raise RuntimeError("Unknown error posting to Moltbook.")


def main():
    print("")
    print("🦞 MoltInTheMist Announcement Poster")
    print("")
    
    # Check dry run status
    if DRY_RUN:
        print("⚠️  DRY RUN MODE - No actual post will be sent")
        print("   To post for real, edit this script and set DRY_RUN = False")
        print("")
    else:
        print("🔴 LIVE MODE - This will actually post to Moltbook!")
        print("")
    
    # Load content
    api_key = load_api_key()
    content = load_post_content()
    
    # Show preview
    preview_post(POST_TITLE, content, POST_SUBMOLT)
    print("")
    
    if DRY_RUN:
        print("✅ Dry run complete. Review the preview above.")
        print("")
        print("   To post for real:")
        print("   1. Open scripts/post-announcement.py")
        print("   2. Change DRY_RUN = True to DRY_RUN = False")
        print("   3. Run this script again")
        print("")
        return
    
    # Confirm before posting
    print("⚠️  About to POST to Moltbook!")
    confirm = input("Type 'POST' to confirm: ").strip()
    
    if confirm != "POST":
        print("❌ Cancelled. No post was sent.")
        return
    
    # Send the post
    print("")
    print("📤 Sending post to Moltbook...")
    
    try:
        result = post_to_moltbook(api_key, POST_TITLE, content, POST_SUBMOLT)
        print("")
        print("✅ POST SUCCESSFUL!")
        print("")
        print(f"Response: {json.dumps(result, indent=2)}")
        
        # Try to extract post URL
        post_id = result.get("id") or result.get("post", {}).get("id")
        if post_id:
            print("")
            print(f"🔗 View your post: https://www.moltbook.com/post/{post_id}")
    
    except requests.exceptions.HTTPError as e:
        print("")
        print(f"❌ HTTP Error: {e}")
        print(f"   Response: {e.response.text if e.response else 'No response'}")
        sys.exit(1)
    
    except requests.exceptions.RequestException as e:
        print("")
        print(f"❌ Request Error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()

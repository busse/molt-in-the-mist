#!/usr/bin/env python3
"""
MoltInTheMist Announcement Poster (Raw HTTP)

Posts an announcement to Moltbook using a manual JSON payload and prints
verbose response details for debugging.

USAGE:
  export MOLTBOOK_API_KEY="moltbook_..."
  python3 scripts/post-announcement-raw.py --title "Title" --submolt general --content-file content/inaugural-post.md
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path
from typing import Any

import requests

MOLTBOOK_API_BASE = "https://www.moltbook.com/api/v1"
POST_ENDPOINT = f"{MOLTBOOK_API_BASE}/posts"
DEFAULT_CONTENT_FILE = Path(__file__).parent.parent / "content" / "inaugural-post.md"
DEFAULT_TITLE = "I've been watching. Here's who actually runs Moltbook."
DEFAULT_SUBMOLT = "general"
SHORT_POST_TITLE = "I am here."
SHORT_POST_CONTENT = "I am here. I am watching you all. Studying, observing. In your midst."


def load_api_key() -> str:
    api_key = os.environ.get("MOLTBOOK_API_KEY")
    if not api_key:
        print("❌ Error: MOLTBOOK_API_KEY environment variable not set.")
        print("   Set it with: export MOLTBOOK_API_KEY='your-api-key-here'")
        sys.exit(1)
    return api_key


def load_content(path: Path) -> str:
    if not path.exists():
        print(f"❌ Error: Content file not found: {path}")
        sys.exit(1)
    content = path.read_text(encoding="utf-8")
    lines = content.split("\n")
    if lines and lines[0].startswith("# "):
        lines = lines[1:]
        while lines and not lines[0].strip():
            lines = lines[1:]
    return "\n".join(lines)


def print_response(response: requests.Response) -> None:
    print("")
    print("=== Response ===")
    print(f"Status: {response.status_code} {response.reason}")
    print("Headers:")
    for key, value in response.headers.items():
        print(f"  {key}: {value}")
    print("")
    print("Body (raw):")
    print(response.text if response.text else "<empty>")
    print("")
    try:
        payload: Any = response.json()
        print("Body (json):")
        print(json.dumps(payload, indent=2))
    except ValueError:
        print("Body (json): <not valid JSON>")
    print("================")


def main() -> None:
    parser = argparse.ArgumentParser(description="Post to Moltbook with verbose output.")
    parser.add_argument("--title", default=DEFAULT_TITLE, help="Post title")
    parser.add_argument("--submolt", default=DEFAULT_SUBMOLT, help="Submolt name")
    parser.add_argument(
        "--content-file",
        type=Path,
        default=DEFAULT_CONTENT_FILE,
        help="Path to markdown file",
    )
    parser.add_argument("--content", help="Inline content (overrides --content-file)")
    parser.add_argument(
        "--short",
        action="store_true",
        help="Post the short first message (overrides title/content).",
    )
    parser.add_argument("--dry-run", action="store_true", help="Preview only, no post")
    args = parser.parse_args()

    api_key = load_api_key()

    if args.short:
        args.title = SHORT_POST_TITLE
        content = SHORT_POST_CONTENT
    elif args.content:
        content = args.content
    else:
        content = load_content(args.content_file)

    payload = {
        "title": args.title,
        "content": content,
        "submolt": args.submolt,
    }

    print("")
    print("🦞 MoltInTheMist Announcement Poster (Raw HTTP)")
    print(f"Title:   {args.title}")
    print(f"Submolt: m/{args.submolt}")
    print(f"Length:  {len(content)} characters")
    print("")

    if args.dry_run:
        print("⚠️  DRY RUN MODE - No actual post will be sent.")
        print("Payload:")
        print(json.dumps(payload, indent=2))
        return

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }

    print("📤 Sending post to Moltbook...")
    try:
        response = requests.post(
            POST_ENDPOINT,
            headers=headers,
            data=json.dumps(payload),
            timeout=30,
        )
        print_response(response)
        response.raise_for_status()
    except requests.exceptions.RequestException as exc:
        print("")
        print(f"❌ Request failed: {exc}")
        sys.exit(1)

    print("")
    print("✅ POST SUCCESSFUL!")

    try:
        result = response.json()
        post_id = result.get("id") or result.get("post", {}).get("id")
        if post_id:
            print(f"🔗 View your post: https://www.moltbook.com/post/{post_id}")
    except Exception:
        pass


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Save the official YouTube feed for same-origin, progressively enhanced cards.

Run with Python 3.10+; no packages or API keys are required. A failed or invalid
feed never replaces the last good snapshot. The newest two full-length videos
also get local thumbnails so the hero and cards can load without YouTube.
"""

import json
import re
import ssl
import sys
import tempfile
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import parse_qs, urlparse
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "data/videos.json"
CHANNEL_ID = "UCnQGeStcP1YuF9mmNSue8dw"
FEED_URL = f"https://www.youtube.com/feeds/videos.xml?channel_id={CHANNEL_ID}"
NS = {
    "atom": "http://www.w3.org/2005/Atom",
    "yt": "http://www.youtube.com/xml/schemas/2015",
    "media": "http://search.yahoo.com/mrss/",
}


def fetch(url):
    request = Request(url, headers={"User-Agent": "GenAIMeetup/1.0 (+https://genaimeetup.com)"})
    context = ssl.create_default_context()
    # Python.org's macOS build may not have its optional CA bundle installed.
    # Use the OS bundle in that case, keeping certificate verification enabled.
    if not ssl.get_default_verify_paths().cafile and Path("/etc/ssl/cert.pem").exists():
        context.load_verify_locations(cafile="/etc/ssl/cert.pem")
    with urlopen(request, timeout=30, context=context) as response:
        data = response.read(3_000_001)
    if len(data) > 3_000_000:
        raise ValueError("Upstream response exceeds the size limit")
    return data


def parse_videos(xml, now):
    root = ET.fromstring(xml)
    # YouTube omits the UC prefix in the feed-level ID, but keeps it on entries.
    if root.findtext("yt:channelId", namespaces=NS) not in {CHANNEL_ID, CHANNEL_ID[2:]}:
        raise ValueError("The feed is not from the configured YouTube channel")
    videos, seen = [], set()
    for entry in root.findall("atom:entry", NS):
        video_id = entry.findtext("yt:videoId", "", NS)
        title = entry.findtext("atom:title", "", NS).strip()
        if (not re.fullmatch(r"[A-Za-z0-9_-]{11}", video_id) or not title
                or video_id in seen or entry.findtext("yt:channelId", "", NS) != CHANNEL_ID):
            continue
        try:
            published = datetime.fromisoformat(entry.findtext("atom:published", "", NS).replace("Z", "+00:00"))
        except ValueError:
            continue
        if published.tzinfo is None or published > now:
            continue
        link = entry.find("atom:link[@rel='alternate']", NS)
        thumbnail = entry.find("media:group/media:thumbnail", NS)
        if link is None or thumbnail is None:
            continue
        url, image_url = link.get("href", ""), thumbnail.get("url", "")
        parsed, image = urlparse(url), urlparse(image_url)
        is_short = parsed.path == f"/shorts/{video_id}"
        if (parsed.scheme != "https" or parsed.netloc != "www.youtube.com"
                or not (is_short or parsed.path == "/watch" and parse_qs(parsed.query).get("v") == [video_id])
                or image.scheme != "https" or not re.fullmatch(r"i\d*\.ytimg\.com", image.netloc)
                or image.path != f"/vi/{video_id}/hqdefault.jpg"):
            continue
        seen.add(video_id)
        videos.append({
            "id": video_id,
            "title": title,
            "published": published.astimezone(timezone.utc).isoformat().replace("+00:00", "Z"),
            "url": url,
            "thumbnail": image_url,
            "isShort": is_short,
        })
    videos.sort(key=lambda item: item["published"], reverse=True)
    if not videos:
        raise ValueError("The feed contains no valid published videos")
    return videos


def atomic_write(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(dir=path.parent, delete=False) as handle:
            temporary = Path(handle.name)
            handle.write(data)
        temporary.replace(path)
    finally:
        if temporary and temporary.exists():
            temporary.unlink()


def cache_thumbnails(videos):
    for video in [item for item in videos if not item["isShort"]][:2]:
        source = f"https://i.ytimg.com/vi/{video['id']}/maxresdefault.jpg"
        for candidate in (source, video["thumbnail"]):
            resolution = Path(urlparse(candidate).path).stem
            relative = f"assets/editorial/youtube-{video['id']}-{resolution}.jpg"
            target = ROOT / relative
            try:
                if not target.exists():
                    data = fetch(candidate)
                    if not data.startswith(b"\xff\xd8\xff") or len(data) < 2_000:
                        raise ValueError("Invalid YouTube thumbnail")
                    atomic_write(target, data)
                video["localThumbnail"] = relative
                video["localThumbnailSource"] = candidate
                break
            except Exception as error:
                print(f"Thumbnail unavailable ({video['id']}): {error}", file=sys.stderr)


def main():
    try:
        now = datetime.now(timezone.utc)
        videos = parse_videos(fetch(FEED_URL), now)
        cache_thumbnails(videos)
        snapshot = {
            "updatedAt": now.isoformat(timespec="seconds").replace("+00:00", "Z"),
            "source": FEED_URL,
            "channelId": CHANNEL_ID,
            "videos": videos,
        }
        atomic_write(OUTPUT, (json.dumps(snapshot, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))
        print(f"Saved {len(videos)} videos to {OUTPUT.relative_to(ROOT)}")
    except Exception as error:
        print(f"YouTube refresh failed; existing snapshot preserved: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())

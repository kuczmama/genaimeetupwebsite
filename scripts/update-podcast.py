#!/usr/bin/env python3
"""Save the latest published audio episode from the official podcast RSS feed.

Run with Python 3.10+; no packages or API keys are required. Fetching or parsing
errors leave the existing snapshot untouched.
"""

import json
import re
import ssl
import sys
import tempfile
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlparse
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "data/podcast.json"
FEED_URL = "https://podcast.genaimeetup.com/feed.xml"
PODCAST_HOST = "podcast.genaimeetup.com"
ITUNES = "{http://www.itunes.com/dtds/podcast-1.0.dtd}"


def fetch(url):
    request = Request(url, headers={"User-Agent": "GenAIMeetup/1.0 (+https://genaimeetup.com)"})
    context = ssl.create_default_context()
    # Keep certificate verification on when the optional Python.org macOS CA
    # bundle is absent, using the operating system's certificate bundle.
    if not ssl.get_default_verify_paths().cafile and Path("/etc/ssl/cert.pem").exists():
        context.load_verify_locations(cafile="/etc/ssl/cert.pem")
    with urlopen(request, timeout=30, context=context) as response:
        data = response.read(3_000_001)
    if len(data) > 3_000_000:
        raise ValueError("Upstream response exceeds the size limit")
    return data


class PlainText(HTMLParser):
    """Keep readable text and paragraph boundaries, discarding active markup."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts = []
        self.hidden = 0

    def handle_starttag(self, tag, attrs):
        if tag in {"script", "style"}:
            self.hidden += 1
        elif not self.hidden and tag in {"p", "div", "br", "li", "h1", "h2", "h3"}:
            self.parts.append("\n")

    def handle_endtag(self, tag):
        if tag in {"script", "style"}:
            self.hidden = max(0, self.hidden - 1)
        elif not self.hidden and tag in {"p", "div", "li", "h1", "h2", "h3"}:
            self.parts.append("\n")

    def handle_data(self, data):
        if not self.hidden:
            self.parts.append(data)


def plain_paragraphs(value):
    parser = PlainText()
    parser.feed(value)
    parser.close()
    return [text for line in "".join(parser.parts).splitlines()
            if (text := " ".join(line.split()))]


def short_description(value):
    paragraphs = plain_paragraphs(value)
    if not paragraphs:
        return ""
    # Podbean descriptions often begin with short sponsor/social links. Prefer
    # an actual prose paragraph over those links or the chapter timestamp list.
    prose = [text for text in paragraphs if len(text) >= 60
             and not re.search(r"https?://|www\.", text, re.IGNORECASE)
             and not re.match(r"^\d{1,2}:\d{2}", text)]
    text = prose[0] if prose else paragraphs[0]
    if len(text) <= 220:
        return text
    shortened = text[:219]
    if " " in shortened:
        shortened = shortened.rsplit(" ", 1)[0]
    return shortened.rstrip(" ,;:") + "…"


def duration_seconds(value):
    value = (value or "").strip()
    if not re.fullmatch(r"\d+(?::\d{1,2}){0,2}", value):
        return None
    parts = [int(part) for part in value.split(":")]
    if any(part >= 60 for part in parts[1:]):
        return None
    total = 0
    for part in parts:
        total = total * 60 + part
    return total if total <= 2**53 - 1 else None


def official_url(url, episode=False):
    parsed = urlparse(url)
    return (parsed.scheme == "https" and parsed.netloc == PODCAST_HOST
            and not parsed.params and not parsed.query and not parsed.fragment
            and bool(re.fullmatch(r"/e/[A-Za-z0-9][A-Za-z0-9_-]*/", parsed.path)
                     if episode else parsed.path in {"", "/"}))


def parse_latest_episode(xml, now):
    root = ET.fromstring(xml)
    channel = root.find("channel") if root.tag == "rss" else None
    if channel is None or not official_url(channel.findtext("link", "").strip()):
        raise ValueError("The feed is not from the configured podcast")
    candidates = []
    for item in channel.findall("item"):
        url = item.findtext("link", "").strip()
        title = " ".join(plain_paragraphs(item.findtext("title", "")))
        if not title or not official_url(url, episode=True):
            continue
        # Video-only items and text posts must not replace the latest audio.
        enclosures = item.findall("enclosure")
        if not any(enclosure.get("type", "").lower().startswith("audio/")
                   and urlparse(enclosure.get("url", "")).scheme == "https"
                   and urlparse(enclosure.get("url", "")).netloc
                   for enclosure in enclosures):
            continue
        try:
            published = parsedate_to_datetime(item.findtext("pubDate", "").strip())
        except (ValueError, TypeError, OverflowError):
            continue
        if published.tzinfo is None or published > now:
            continue
        candidates.append({
            "title": title,
            "url": url,
            "publishedAt": published.astimezone(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
            "durationSeconds": duration_seconds(item.findtext(ITUNES + "duration")),
            "description": short_description(item.findtext("description")
                                             or item.findtext(ITUNES + "summary", "")),
        })
    if not candidates:
        raise ValueError("The feed contains no valid published audio episodes")
    return max(candidates, key=lambda episode: episode["publishedAt"])


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


def main():
    try:
        now = datetime.now(timezone.utc)
        latest = parse_latest_episode(fetch(FEED_URL), now)
        snapshot = {
            "sourceUrl": FEED_URL,
            "updatedAt": now.isoformat(timespec="seconds").replace("+00:00", "Z"),
            "latestEpisode": latest,
        }
        atomic_write(OUTPUT, (json.dumps(snapshot, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))
        print(f"Saved latest podcast episode: {latest['title']}")
    except Exception as error:
        print(f"Podcast refresh failed; existing snapshot preserved: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())

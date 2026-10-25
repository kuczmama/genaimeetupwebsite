#!/usr/bin/env python3
"""Cache the newest two published articles from the official Substack RSS feed.

Python 3.10+ standard library, with a curl HTTP/2 retry for public HTTP 403
responses; no API keys or browser session are required.
Feed failures preserve the previous snapshot. Thumbnail failures are optional
and leave the original official image URL available to the frontend.
"""

import hashlib
import json
import re
import ssl
import subprocess
import sys
import tempfile
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import quote, unquote, urlparse
from urllib.error import HTTPError
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "data/articles.json"
FEED_URL = "https://genaipod.substack.com/feed"
PUBLICATION_URL = "https://genaipod.substack.com"
CONTENT = "{http://purl.org/rss/1.0/modules/content/}encoded"
ITUNES = "{http://www.itunes.com/dtds/podcast-1.0.dtd}"
IMAGE_HOSTS = {"substack-post-media.s3.amazonaws.com", "substackcdn.com"}
MAX_RESPONSE_BYTES = 5_000_000
HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; GenAIMeetup/1.0; +https://genaimeetup.com)",
    "Accept": "application/rss+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.1",
}


def validate_response_url(final_url, requested_url):
    final = urlparse(final_url)
    allowed = {"genaipod.substack.com"} if requested_url == FEED_URL else IMAGE_HOSTS
    if final.scheme != "https" or final.netloc not in allowed:
        raise ValueError("Upstream redirected outside its official host")


def fetch_with_curl(url):
    # Some public RSS requests are rejected with urllib's HTTP/1.1 transport on
    # hosted runners. Retry once with curl's ordinary HTTP/2 client, without
    # cookies, credentials, proxies, or a browser session.
    command = [
        "curl", "--http2", "--fail", "--silent", "--show-error", "--location",
        "--max-redirs", "3", "--proto", "=https", "--proto-redir", "=https",
        "--connect-timeout", "10", "--max-time", "30",
        "--max-filesize", str(MAX_RESPONSE_BYTES),
        "--user-agent", HEADERS["User-Agent"], "--header", f"Accept: {HEADERS['Accept']}",
        "--write-out", "%{stderr}\nGENAI_EFFECTIVE_URL:%{url_effective}\n", url,
    ]
    # Read at most the limit plus one byte even if an older curl cannot enforce
    # --max-filesize on a chunked response. The curl deadline bounds the read.
    with tempfile.TemporaryFile() as diagnostics:
        process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=diagnostics)
        try:
            data = process.stdout.read(MAX_RESPONSE_BYTES + 1)
            if len(data) > MAX_RESPONSE_BYTES:
                raise ValueError("Upstream response exceeds the size limit")
            status = process.wait(timeout=5)
        finally:
            if process.poll() is None:
                process.kill()
                process.wait(timeout=5)
            process.stdout.close()
        diagnostics.seek(0)
        output = diagnostics.read(16_384).decode("utf-8", errors="replace")
    if status:
        raise OSError(f"Public Substack curl request failed (exit {status})")
    final_urls = [line.removeprefix("GENAI_EFFECTIVE_URL:") for line in output.splitlines()
                  if line.startswith("GENAI_EFFECTIVE_URL:")]
    if not final_urls:
        raise ValueError("curl did not report its final response URL")
    validate_response_url(final_urls[-1], url)
    return data


def fetch(url):
    request = Request(url, headers=HEADERS)
    context = ssl.create_default_context()
    if not ssl.get_default_verify_paths().cafile and Path("/etc/ssl/cert.pem").exists():
        context.load_verify_locations(cafile="/etc/ssl/cert.pem")
    try:
        with urlopen(request, timeout=30, context=context) as response:
            validate_response_url(response.url, url)
            data = response.read(MAX_RESPONSE_BYTES + 1)
    except HTTPError as error:
        if error.code != 403:
            raise
        print("Public Substack request returned HTTP 403; retrying with curl HTTP/2", file=sys.stderr)
        return fetch_with_curl(url)
    if len(data) > MAX_RESPONSE_BYTES:
        raise ValueError("Upstream response exceeds the size limit")
    return data


class PlainText(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts = []
        self.hidden = 0

    def handle_starttag(self, tag, attrs):
        if tag in {"script", "style"}:
            self.hidden += 1
        if tag in {"p", "div", "br", "li", "h1", "h2", "h3"}:
            self.parts.append(" ")

    def handle_endtag(self, tag):
        if tag in {"script", "style"} and self.hidden:
            self.hidden -= 1
        if tag in {"p", "div", "li", "h1", "h2", "h3"}:
            self.parts.append(" ")

    def handle_data(self, data):
        if not self.hidden:
            self.parts.append(data)


def plain_text(value, limit=None):
    parser = PlainText()
    parser.feed(value)
    text = " ".join("".join(parser.parts).split())
    if limit and len(text) > limit:
        prefix = text[:limit - 1]
        if " " in prefix:
            prefix = prefix.rsplit(" ", 1)[0]
        text = prefix.rstrip(" ,.;:") + "…"
    return text


def article_url(value):
    try:
        parsed = urlparse(value)
    except ValueError:
        return None
    if (value != value.strip() or parsed.scheme != "https"
            or parsed.netloc != "genaipod.substack.com" or parsed.query or parsed.fragment
            or not re.fullmatch(r"/p/[A-Za-z0-9][A-Za-z0-9_-]*/?", parsed.path)):
        return None
    return value.rstrip("/")


def thumbnail_url(value):
    try:
        parsed = urlparse(value)
    except ValueError:
        return None
    if (value != value.strip() or parsed.scheme != "https" or parsed.netloc not in IMAGE_HOSTS
            or parsed.fragment or not parsed.path.startswith(("/public/images/", "/image/fetch/"))):
        return None
    return value


def parse_articles(xml, now):
    root = ET.fromstring(xml)
    channel = root.find("channel")
    if root.tag != "rss" or channel is None or channel.findtext("link", "").rstrip("/") != PUBLICATION_URL:
        raise ValueError("The feed is not from the configured Substack publication")
    articles = []
    for item in channel.findall("item"):
        title = plain_text(item.findtext("title", ""))
        url = article_url(item.findtext("link", ""))
        enclosures = item.findall("enclosure")
        if (not title or len(title) > 500 or not url
                or any(node.get("type", "").lower().startswith(("audio/", "video/")) for node in enclosures)
                or item.find(f"{ITUNES}duration") is not None):
            continue
        try:
            published = parsedate_to_datetime(item.findtext("pubDate", ""))
        except (TypeError, ValueError, OverflowError):
            continue
        if published.tzinfo is None or published > now:
            continue
        description = item.findtext("description", "") or item.findtext(CONTENT, "")
        article = {
            "title": title,
            "url": url,
            "published": published.astimezone(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
            "description": plain_text(description, 220),
        }
        for enclosure in enclosures:
            thumbnail = thumbnail_url(enclosure.get("url", ""))
            if enclosure.get("type", "").lower().startswith("image/") and thumbnail:
                article["thumbnail"] = thumbnail
                break
        articles.append(article)
    articles.sort(key=lambda item: item["published"], reverse=True)
    unique = {}
    for article in articles:
        unique.setdefault(article["url"], article)
    if len(unique) < 2:
        raise ValueError("The feed contains fewer than two valid published text articles")
    return list(unique.values())[:2]


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


def image_extension(data):
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "png"
    if data.startswith(b"\xff\xd8\xff"):
        return "jpg"
    if data.startswith((b"GIF87a", b"GIF89a")):
        return "gif"
    if data.startswith(b"RIFF") and data[8:12] == b"WEBP":
        return "webp"
    raise ValueError("Invalid Substack thumbnail")


def optimized_thumbnail_url(source):
    # These are the publication's native image-fetch options, also present in
    # its article HTML. Let its CDN serve a card-sized JPEG instead of caching
    # multi-megabyte original PNGs; retain both source URLs in the snapshot.
    parsed = urlparse(source)
    if parsed.netloc == "substackcdn.com":
        source = unquote(parsed.path.split("/", 4)[-1])
    original = urlparse(source)
    if (not thumbnail_url(source) or original.netloc != "substack-post-media.s3.amazonaws.com"
            or not original.path.startswith("/public/images/")):
        raise ValueError("Thumbnail does not identify an official original image")
    return "https://substackcdn.com/image/fetch/w_960,c_limit,f_jpg,q_auto:good,fl_progressive:steep/" + quote(source, safe="")


def cache_thumbnails(articles):
    for article in articles:
        source = article.get("thumbnail")
        if not source:
            continue
        slug = urlparse(article["url"]).path.rsplit("/", 1)[-1]
        try:
            cached_source = optimized_thumbnail_url(source)
            digest = hashlib.sha256(cached_source.encode()).hexdigest()[:12]
            stem = f"assets/editorial/substack-{slug}-{digest}"
            existing = next((ROOT / f"{stem}.{ext}" for ext in ("png", "jpg", "webp", "gif")
                             if (ROOT / f"{stem}.{ext}").is_file()), None)
            if existing and image_extension(existing.read_bytes()) == existing.suffix[1:]:
                article["localThumbnail"] = existing.relative_to(ROOT).as_posix()
                article["localThumbnailSource"] = cached_source
                continue
            data = fetch(cached_source)
            extension = image_extension(data)
            relative = f"{stem}.{extension}"
            atomic_write(ROOT / relative, data)
            article["localThumbnail"] = relative
            article["localThumbnailSource"] = cached_source
        except Exception as error:
            print(f"Thumbnail unavailable ({slug}): {error}", file=sys.stderr)


def main():
    try:
        now = datetime.now(timezone.utc)
        articles = parse_articles(fetch(FEED_URL), now)
        cache_thumbnails(articles)
        snapshot = {
            "source": FEED_URL,
            "updatedAt": now.isoformat(timespec="seconds").replace("+00:00", "Z"),
            "articles": articles,
        }
        atomic_write(OUTPUT, (json.dumps(snapshot, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))
        print(f"Saved {len(articles)} articles to {OUTPUT.relative_to(ROOT)}")
    except Exception as error:
        print(f"Substack refresh failed; existing snapshot preserved: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())

"""Checks for published article selection and safe snapshot refresh failures."""

import contextlib
import importlib.util
import io
import json
import tempfile
import unittest
from datetime import datetime, timezone
from html import escape
from pathlib import Path
from urllib.parse import quote
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location(
    "update_articles", Path(__file__).resolve().parents[1] / "scripts/update-articles.py"
)
articles = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(articles)
NOW = datetime(2026, 10, 24, tzinfo=timezone.utc)
IMAGE = "https://substack-post-media.s3.amazonaws.com/public/images/example.png"


def entry(slug="recent", published="Thu, 01 Oct 2026 13:45:50 GMT", title="AI & learning",
          link=None, description="<p>What we <em>learned</em> &#8212; and why.</p>",
          enclosure_type="image/jpeg", thumbnail=IMAGE):
    url = link if link is not None else f"https://genaipod.substack.com/p/{slug}"
    return f"""<item>
      <title>{escape(title)}</title><link>{escape(url)}</link>
      <pubDate>{escape(published)}</pubDate>
      <description>{escape(description)}</description>
      <enclosure type="{escape(enclosure_type)}" url="{escape(thumbnail)}"/>
    </item>"""


def feed(*entries, publication=articles.PUBLICATION_URL):
    return f"""<rss version="2.0"><channel><title>Gen AI Podcast</title>
      <link>{escape(publication)}</link>{''.join(entries)}
    </channel></rss>""".encode()


def valid_feed(*extra):
    return feed(entry(), entry("older", "Wed, 26 Aug 2026 14:01:24 GMT"), *extra)


class ArticleSnapshotTests(unittest.TestCase):
    def test_returns_only_newest_two_sorted_and_deduplicated_after_timezone_normalization(self):
        data = feed(
            entry("oldest", "Wed, 01 Jul 2026 12:00:00 GMT"),
            entry("recent/"), entry("recent"),
            entry("newest", "Fri, 02 Oct 2026 02:00:00 +0200"),
        )
        result = articles.parse_articles(data, NOW)
        self.assertEqual([item["url"] for item in result], [
            "https://genaipod.substack.com/p/newest", "https://genaipod.substack.com/p/recent",
        ])
        self.assertEqual(result[0]["published"], "2026-10-02T00:00:00Z")
        self.assertEqual(result[0]["title"], "AI & learning")
        self.assertEqual(result[0]["description"], "What we learned — and why.")

    def test_filters_future_malformed_and_audio_or_video_posts(self):
        data = valid_feed(
            entry("future", "Mon, 01 Jan 2099 00:00:00 GMT"),
            entry("invalid-date", "not a date"),
            entry("impossible-date", "Mon, 30 Feb 2026 00:00:00 GMT"),
            entry("missing-zone", "Fri, 02 Oct 2026 00:00:00 -0000"),
            entry("blank-title", title="  "),
            entry("audio", "Fri, 02 Oct 2026 00:00:00 GMT", enclosure_type="audio/mpeg"),
            entry("video", "Fri, 02 Oct 2026 00:00:00 GMT", enclosure_type="video/mp4"),
        )
        self.assertEqual([item["url"].rsplit("/", 1)[-1] for item in articles.parse_articles(data, NOW)], ["recent", "older"])

    def test_foreign_or_unsafe_article_links_are_excluded(self):
        invalid = [
            "javascript:alert(1)", "http://genaipod.substack.com/p/story",
            "https://genaipod.substack.com.evil.example/p/story",
            "https://user:password@genaipod.substack.com/p/story",
            "https://genaipod.substack.com:8443/p/story",
            "https://genaipod.substack.com/p/story?redirect=https://evil.example",
            "https://genaipod.substack.com/p/story#fragment",
            "https://genaipod.substack.com/p/%2f%2fevil.example",
            "https://genaipod.substack.com/p/-invalid-slug",
            "https://genaipod.substack.com/feed", "https://[broken",
        ]
        data = valid_feed(*(entry("unsafe", "Fri, 02 Oct 2026 00:00:00 GMT", link=url) for url in invalid))
        self.assertEqual(len(articles.parse_articles(data, NOW)), 2)
        self.assertEqual(articles.parse_articles(data, NOW)[0]["url"], "https://genaipod.substack.com/p/recent")

    def test_rejects_wrong_publication_and_incomplete_feed(self):
        for xml in [feed(entry(), entry("other"), publication="https://different.substack.com"),
                    feed(entry(), entry()), b"<html>Try again later</html>", b"<invalid"]:
            with self.subTest(xml=xml), self.assertRaises((ValueError, articles.ET.ParseError)):
                articles.parse_articles(xml, NOW)

    def test_plain_descriptions_are_bounded_and_untrusted_images_are_omitted(self):
        description = "<script>unwanted()</script><p>" + ("A useful explanation &amp; example. " * 30) + "</p>"
        result = articles.parse_articles(feed(
            entry(description=description, thumbnail="https://evil.example/image.png"),
            entry("older", "Wed, 26 Aug 2026 14:01:24 GMT", thumbnail="https://[broken"),
        ), NOW)
        self.assertLessEqual(len(result[0]["description"]), 220)
        self.assertTrue(result[0]["description"].endswith("…"))
        self.assertNotIn("unwanted", result[0]["description"])
        self.assertNotIn("<", result[0]["description"])
        self.assertIn("&", result[0]["description"])
        self.assertTrue(all("thumbnail" not in item for item in result))

    def test_failed_fetch_parse_or_write_preserves_last_snapshot(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            output = root / "articles.json"
            saved = b'{"articles":[{"title":"Last successful articles"}]}\n'
            output.write_bytes(saved)
            failures = [
                {"side_effect": OSError("offline")},
                {"return_value": b"<invalid"},
                {"return_value": feed(entry())},
            ]
            for replacement in failures:
                with patch.object(articles, "ROOT", root), patch.object(articles, "OUTPUT", output), \
                        patch.object(articles, "fetch", **replacement), contextlib.redirect_stderr(io.StringIO()):
                    self.assertEqual(articles.main(), 1)
                self.assertEqual(output.read_bytes(), saved)
            with patch.object(articles, "ROOT", root), patch.object(articles, "OUTPUT", output), \
                    patch.object(articles, "fetch", return_value=valid_feed()), \
                    patch.object(articles, "cache_thumbnails"), \
                    patch.object(articles, "atomic_write", side_effect=OSError("disk full")), \
                    contextlib.redirect_stderr(io.StringIO()):
                self.assertEqual(articles.main(), 1)
            self.assertEqual(output.read_bytes(), saved)

    def test_successful_refresh_writes_latest_two_and_keeps_source_provenance(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            output = root / "articles.json"
            with patch.object(articles, "ROOT", root), patch.object(articles, "OUTPUT", output), \
                    patch.object(articles, "fetch", return_value=valid_feed()), \
                    patch.object(articles, "cache_thumbnails"), contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(articles.main(), 0)
            saved = json.loads(output.read_text())
            self.assertEqual(saved["source"], articles.FEED_URL)
            self.assertTrue(saved["updatedAt"].endswith("Z"))
            self.assertEqual(len(saved["articles"]), 2)
            self.assertEqual(saved["articles"][0]["thumbnail"], IMAGE)

    def test_thumbnail_failures_keep_remote_source_and_valid_cache_is_reused(self):
        with tempfile.TemporaryDirectory() as directory:
            result = articles.parse_articles(valid_feed(), NOW)
            with patch.object(articles, "ROOT", Path(directory)), \
                    patch.object(articles, "fetch", side_effect=OSError("image unavailable")), \
                    contextlib.redirect_stderr(io.StringIO()):
                articles.cache_thumbnails(result)
            self.assertTrue(all(item["thumbnail"] == IMAGE and "localThumbnail" not in item for item in result))
            with patch.object(articles, "ROOT", Path(directory)), \
                    patch.object(articles, "fetch", return_value=b"\x89PNG\r\n\x1a\nexample") as fetch:
                articles.cache_thumbnails(result)
                self.assertEqual(fetch.call_count, 2)
                articles.cache_thumbnails(result)
                self.assertEqual(fetch.call_count, 2)
            self.assertTrue(all(item["localThumbnail"].startswith("assets/editorial/substack-") for item in result))
            self.assertTrue(all(item["thumbnail"] == IMAGE for item in result))
            self.assertTrue(all(item["localThumbnailSource"] == articles.optimized_thumbnail_url(IMAGE) for item in result))

    def test_cdn_thumbnail_uses_original_image_without_nested_fetches_or_foreign_sources(self):
        wrapped = "https://substackcdn.com/image/fetch/w_1456,c_limit,f_auto/" + quote(IMAGE, safe="")
        self.assertEqual(articles.optimized_thumbnail_url(wrapped), articles.optimized_thumbnail_url(IMAGE))
        self.assertIn("w_960,c_limit,f_jpg", articles.optimized_thumbnail_url(IMAGE))
        for source in ["https://evil.example/image.png", "https://substackcdn.com/image/fetch/w_1200/https%3A%2F%2Fevil.example%2Fimage.png"]:
            with self.subTest(source=source), self.assertRaises(ValueError):
                articles.optimized_thumbnail_url(source)


if __name__ == "__main__":
    unittest.main()

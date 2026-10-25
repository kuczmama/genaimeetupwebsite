"""Podcast publication, URL, text, duration, and snapshot failure checks."""

import contextlib
import importlib.util
import io
import json
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location(
    "update_podcast", Path(__file__).resolve().parents[1] / "scripts/update-podcast.py"
)
podcast = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(podcast)
NOW = datetime(2026, 10, 24, tzinfo=timezone.utc)


def item(slug="latest", published="Tue, 20 Oct 2026 05:54:20 -0700", **options):
    title = options.get("title", "AI &amp; software")
    url = options.get("url", f"https://podcast.genaimeetup.com/e/{slug}/")
    media_type = options.get("media_type", "audio/mpeg")
    description = options.get("description", "<p>A discussion of AI &amp; software.</p>")
    duration = options.get("duration", "5735")
    return f"""<item><title>{title}</title><link>{url}</link>
      <pubDate>{published}</pubDate>
      <enclosure url="https://mcdn.podbean.com/episode.mp3" type="{media_type}"/>
      <description><![CDATA[{description}]]></description>
      <itunes:duration>{duration}</itunes:duration></item>"""


def feed(*items):
    return f"""<rss version="2.0" xmlns:itunes="{podcast.ITUNES[1:-1]}">
      <channel><title>Gen AI Podcast</title><link>https://podcast.genaimeetup.com</link>
      {''.join(items)}</channel></rss>""".encode()


def episode_page(slug="latest", player_id="tniji-1b8c456", **options):
    player_url = options.get("player_url", f"{podcast.PLAYER_BASE}?i={player_id}&amp;square=1")
    return f"""<!doctype html><html><head>
      <link rel="canonical" href="https://podcast.genaimeetup.com/e/{slug}/">
      <meta name="twitter:player" content="{player_url}">
      </head><body></body></html>""".encode()


class PodcastSnapshotTests(unittest.TestCase):
    def test_selects_newest_published_audio_regardless_of_feed_order(self):
        result = podcast.parse_latest_episode(feed(
            item("old", "Fri, 02 Oct 2026 23:40:46 -0700"),
            item("future", "Tue, 27 Oct 2026 05:54:20 -0700"),
            item("latest"),
            item("video", "Thu, 22 Oct 2026 05:54:20 -0700", media_type="video/mp4"),
            item("invalid-date", "not a date"),
            item("naive-date", "Fri, 23 Oct 2026 05:54:20"),
        ), NOW)
        self.assertEqual(result["url"], "https://podcast.genaimeetup.com/e/latest/")
        self.assertEqual(result["title"], "AI & software")
        self.assertEqual(result["publishedAt"], "2026-10-20T12:54:20Z")
        self.assertEqual(result["durationSeconds"], 5735)

    def test_rejects_wrong_source_and_unsafe_episode_urls(self):
        wrong_feed = feed(item()).replace(b"<link>https://podcast.genaimeetup.com</link>",
                                          b"<link>https://example.com</link>")
        with self.assertRaises(ValueError):
            podcast.parse_latest_episode(wrong_feed, NOW)
        for url in (
            "http://podcast.genaimeetup.com/e/episode/",
            "https://podcast.genaimeetup.com.example.com/e/episode/",
            "https://user@podcast.genaimeetup.com/e/episode/",
            "https://podcast.genaimeetup.com/other/",
            "https://podcast.genaimeetup.com/e/episode/?redirect=evil",
            "https://podcast.genaimeetup.com/e/../",
            "https://podcast.genaimeetup.com/e/_invalid/",
            "javascript:alert(1)",
        ):
            with self.subTest(url=url), self.assertRaises(ValueError):
                podcast.parse_latest_episode(feed(item(url=url)), NOW)

    def test_plain_description_uses_prose_without_markup_and_is_bounded(self):
        description = ("<script>hidden script</script><style>hidden CSS</style>"
                       "<p>Sponsored by <a href='https://example.com'>https://example.com</a></p>"
                       "<p>AI &amp; software are changing how people work. " + "More useful detail. " * 20 + "</p>"
                       "<p>00:00 Intro</p>")
        result = podcast.parse_latest_episode(feed(item(description=description)), NOW)
        text = result["description"]
        self.assertTrue(text.startswith("AI & software"))
        self.assertLessEqual(len(text), 220)
        self.assertTrue(text.endswith("…"))
        self.assertNotIn("<", text)
        self.assertNotIn("hidden", text)
        self.assertEqual(podcast.short_description(""), "")

    def test_duration_formats_and_unknown_duration(self):
        for value, expected in (("5735", 5735), ("1:35:35", 5735), ("95:35", 5735),
                                ("0", 0), ("", None), ("1:99", None), ("-5", None),
                                ("unknown", None), ("1:2:3:4", None)):
            with self.subTest(duration=value):
                self.assertEqual(podcast.duration_seconds(value), expected)
        result = podcast.parse_latest_episode(feed(item(duration="")), NOW)
        self.assertIsNone(result["durationSeconds"])

    def test_extracts_official_episode_id_and_classic_player_settings(self):
        url = podcast.parse_episode_embed(episode_page(), "https://podcast.genaimeetup.com/e/latest/")
        self.assertEqual(url, "https://www.podbean.com/player-v2/?i=tniji-1b8c456&share=0&download=0&rtl=0&fonts=Arial&skin=1&font-color=auto&logo_link=none&btn-skin=b92358&size=150")
        self.assertNotIn("square=1", url)
        self.assertNotIn("auto=1", url)

    def test_rejects_missing_malformed_and_foreign_embeds(self):
        episode_url = "https://podcast.genaimeetup.com/e/latest/"
        for html in (
            b"<html>No player metadata</html>",
            episode_page(slug="different-episode"),
            episode_page(player_id="pbblog-daq9r-11101d0-playlist"),
            episode_page(player_url="https://example.com/player-v2/?i=tniji-1b8c456"),
            episode_page(player_url="https://www.podbean.com.evil/player-v2/?i=tniji-1b8c456"),
            episode_page(player_url="http://www.podbean.com/player-v2/?i=tniji-1b8c456"),
            episode_page(player_url="https://www.podbean.com/player-v2/?i=tniji-1b8c456&amp;i=other-123"),
            episode_page(player_url="https://www.podbean.com/player-v2/?i=tniji-1b8c456&amp;auto=1"),
            episode_page(player_url="https://www.podbean.com/player-v2/?i=tniji-1b8c456&amp;redirect=https://evil.com"),
            episode_page(player_url="https://www.podbean.com/player-v2/?i=tniji-1b8c456#fragment"),
            episode_page(player_url="https://www.podbean.com/player-v2/?missing-equals"),
        ):
            with self.subTest(html=html), self.assertRaises(ValueError):
                podcast.parse_episode_embed(html, episode_url)

    def test_failed_fetch_invalid_feed_or_failed_write_preserves_snapshot(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "podcast.json"
            saved = b'{"latestEpisode":{"title":"Previous episode"}}\n'
            output.write_bytes(saved)
            for replacement in ({"side_effect": OSError("offline")},
                                {"return_value": b"<invalid"},
                                {"return_value": feed(item("future", "Tue, 27 Oct 2099 05:54:20 -0700"))},
                                {"side_effect": [feed(item()), OSError("episode page offline")]},
                                {"side_effect": [feed(item()), b"<html>Missing player</html>"]},
                                {"side_effect": [feed(item()), episode_page(slug="other")]},
                                {"side_effect": [feed(item()), episode_page(player_id="invalid")]}):
                with patch.object(podcast, "OUTPUT", output), patch.object(podcast, "fetch", **replacement), contextlib.redirect_stderr(io.StringIO()):
                    self.assertEqual(podcast.main(), 1)
                self.assertEqual(output.read_bytes(), saved)
            with patch.object(podcast, "OUTPUT", output), patch.object(podcast, "fetch", side_effect=[feed(item()), episode_page()]), patch.object(Path, "replace", side_effect=OSError("read-only")), contextlib.redirect_stderr(io.StringIO()):
                self.assertEqual(podcast.main(), 1)
            self.assertEqual(output.read_bytes(), saved)
            self.assertEqual(list(Path(directory).iterdir()), [output])

    def test_success_writes_expected_snapshot_contract(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "podcast.json"
            with patch.object(podcast, "OUTPUT", output), patch.object(podcast, "fetch", side_effect=[feed(item("new-episode")), episode_page("new-episode", "new01-abc1234")]) as fetch, contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(podcast.main(), 0)
            self.assertEqual([call.args[0] for call in fetch.call_args_list],
                             [podcast.FEED_URL, "https://podcast.genaimeetup.com/e/new-episode/"])
            snapshot = json.loads(output.read_text())
            self.assertEqual(set(snapshot), {"sourceUrl", "updatedAt", "latestEpisode"})
            self.assertEqual(snapshot["sourceUrl"], podcast.FEED_URL)
            self.assertEqual(set(snapshot["latestEpisode"]), {"title", "url", "publishedAt", "durationSeconds", "description", "embedUrl"})
            self.assertIn("?i=new01-abc1234&", snapshot["latestEpisode"]["embedUrl"])
            self.assertTrue(snapshot["updatedAt"].endswith("Z"))


if __name__ == "__main__":
    unittest.main()

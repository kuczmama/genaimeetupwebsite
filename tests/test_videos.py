"""Checks for publication filtering and retaining the last successful snapshot."""

import contextlib
import importlib.util
import io
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location(
    "update_videos", Path(__file__).resolve().parents[1] / "scripts/update-videos.py"
)
videos = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(videos)
NOW = datetime(2026, 10, 24, tzinfo=timezone.utc)


def entry(video_id="mt4qfLVVh9g", published="2026-10-20T20:43:10Z", short=False):
    path = f"shorts/{video_id}" if short else f"watch?v={video_id}"
    return f"""<entry>
      <yt:videoId>{video_id}</yt:videoId><yt:channelId>{videos.CHANNEL_ID}</yt:channelId>
      <title>AI &amp; software</title><published>{published}</published>
      <link rel="alternate" href="https://www.youtube.com/{path}"/>
      <media:group><media:thumbnail url="https://i2.ytimg.com/vi/{video_id}/hqdefault.jpg"/></media:group>
    </entry>"""


def feed(*entries):
    return f"""<feed xmlns="{videos.NS['atom']}" xmlns:yt="{videos.NS['yt']}" xmlns:media="{videos.NS['media']}">
      <yt:channelId>{videos.CHANNEL_ID[2:]}</yt:channelId>{''.join(entries)}
    </feed>""".encode()


class VideoSnapshotTests(unittest.TestCase):
    def test_sorts_publications_preserves_shorts_and_decodes_title(self):
        result = videos.parse_videos(feed(entry(), entry("xuMjOMMJC8k", "2026-10-21T06:00:40Z", True)), NOW)
        self.assertEqual([item["id"] for item in result], ["xuMjOMMJC8k", "mt4qfLVVh9g"])
        self.assertTrue(result[0]["isShort"])
        self.assertFalse(result[1]["isShort"])
        self.assertEqual(result[1]["title"], "AI & software")

    def test_excludes_duplicates_future_dates_and_invalid_video_ids(self):
        result = videos.parse_videos(feed(entry(), entry(), entry("futureID123", "2099-01-01T00:00:00Z"), entry("bad-id")), NOW)
        self.assertEqual([item["id"] for item in result], ["mt4qfLVVh9g"])

    def test_rejects_foreign_channel_and_foreign_links(self):
        for data in (
            feed(entry()).replace(videos.CHANNEL_ID[2:].encode(), b"wrong-channel"),
            feed(entry()).replace(b"www.youtube.com", b"example.com"),
            feed(entry()).replace(b"i2.ytimg.com", b"example.com"),
        ):
            with self.subTest(feed=data), self.assertRaises(ValueError):
                videos.parse_videos(data, NOW)

    def test_failed_or_invalid_fetch_leaves_saved_snapshot_untouched(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "videos.json"
            saved = b'{"videos":[{"id":"mt4qfLVVh9g"}]}\n'
            output.write_bytes(saved)
            for replacement in ({"side_effect": OSError("offline")}, {"return_value": b"<invalid"}):
                with patch.object(videos, "OUTPUT", output), patch.object(videos, "fetch", **replacement), contextlib.redirect_stderr(io.StringIO()):
                    self.assertEqual(videos.main(), 1)
                self.assertEqual(output.read_bytes(), saved)


if __name__ == "__main__":
    unittest.main()

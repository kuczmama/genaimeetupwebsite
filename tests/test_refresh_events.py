from datetime import datetime, timezone
import importlib.util
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("refresh_events", Path(__file__).resolve().parents[1] / "scripts" / "refresh_events.py")
calendar = importlib.util.module_from_spec(spec)
spec.loader.exec_module(calendar)


def event(uid="1", date="20261029T190000", extra="", title="AI Social"):
    return f"""BEGIN:VEVENT
UID:{uid}
DTSTART;TZID=America/Los_Angeles:{date}
SUMMARY:{title}
URL;VALUE=URI:https://www.meetup.com/gen-ai/events/{uid}/
{extra}END:VEVENT
"""


def feed(*events):
    return "BEGIN:VCALENDAR\nVERSION:2.0\n" + "".join(events) + "END:VCALENDAR"


class CalendarTests(unittest.TestCase):
    now = datetime(2026, 10, 24, tzinfo=timezone.utc)

    def parse(self, value):
        return calendar.parse_calendar(value, self.now)

    def test_pacific_daylight_and_standard_time(self):
        results = self.parse(feed(event("1"), event("2", "20261105T190000")))
        self.assertEqual([item["startsAt"] for item in results], ["2026-10-30T02:00:00Z", "2026-11-06T03:00:00Z"])

    def test_folded_and_escaped_text(self):
        result = self.parse(feed(event(title="AI\\, people\\;\n projects")))[0]
        self.assertEqual(result["title"], "AI, people;projects")

    def test_cancelled_and_expired_events_are_not_upcoming(self):
        self.assertEqual(self.parse(feed(event(extra="STATUS:CANCELLED\n"), event("2", "20260101T190000"))), [])

    def test_latest_sequence_and_chronological_order(self):
        result = self.parse(feed(event("2", "20261105T190000"), event("1", extra="SEQUENCE:1\n"), event("1", extra="SEQUENCE:2\n", title="Updated")))
        self.assertEqual([(item["id"], item["title"]) for item in result], [("1", "Updated"), ("2", "AI Social")])

    def test_error_page_or_truncated_feed_is_rejected(self):
        for value in ("<html>Access denied</html>", feed(event()).replace("END:VCALENDAR", "")):
            with self.assertRaises(ValueError):
                self.parse(value)

    def test_invalid_event_destination_is_rejected(self):
        with self.assertRaises(ValueError):
            self.parse(feed(event()).replace("https://www.meetup.com", "https://unrelated.example"))

    def test_unexpanded_recurrence_is_rejected(self):
        with self.assertRaises(ValueError):
            self.parse(feed(event(extra="RRULE:FREQ=WEEKLY\n")))

    def test_failed_refresh_preserves_last_snapshot(self):
        with tempfile.TemporaryDirectory() as directory:
            original = Path(directory) / "events.json"
            original.write_text('{"last": "successful snapshot"}\n')
            bad_feed = Path(directory) / "error.ics"
            bad_feed.write_text("<html>Service unavailable</html>")
            result = subprocess.run([
                sys.executable, "-B", str(Path(calendar.__file__)),
                "--input", str(bad_feed), "--output", str(original),
            ], capture_output=True, text=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertEqual(original.read_text(), '{"last": "successful snapshot"}\n')


if __name__ == "__main__":
    unittest.main()

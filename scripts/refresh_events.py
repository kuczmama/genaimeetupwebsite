#!/usr/bin/env python3
"""Refresh the homepage calendar from Meetup without a browser CORS proxy.

Only Python's standard library is required. Invalid or failed downloads exit
without replacing the last successful snapshot.
"""

import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import re
from urllib.parse import urlparse
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

SOURCE = "https://www.meetup.com/gen-ai/events/ical/"
DEFAULT_ZONE = "America/Los_Angeles"
OUTPUT = Path(__file__).resolve().parents[1] / "data" / "events.json"


def text_value(value):
    return re.sub(r"\\([nN,;\\])", lambda match: "\n" if match[1].lower() == "n" else match[1], value).strip()


def parse_date(value, params):
    zone = params.get("TZID", DEFAULT_ZONE)
    if value.endswith("Z"):
        result = datetime.strptime(value, "%Y%m%dT%H%M%SZ").replace(tzinfo=timezone.utc)
    else:
        # Dates without a time are also permitted by iCalendar.
        pattern = "%Y%m%d" if params.get("VALUE") == "DATE" else "%Y%m%dT%H%M%S"
        result = datetime.strptime(value, pattern).replace(tzinfo=ZoneInfo(zone))
    return result, zone


def parse_calendar(source, now):
    source = re.sub(r"\r?\n[ \t]", "", source)
    lines = source.replace("\r\n", "\n").strip().split("\n")
    if not lines or lines[0] != "BEGIN:VCALENDAR" or lines[-1] != "END:VCALENDAR":
        raise ValueError("Meetup did not return a complete iCalendar feed")
    records = []
    record = None
    nested = 0
    for line in lines:
        if line == "BEGIN:VEVENT":
            if record is not None:
                raise ValueError("Malformed nested event")
            record = {}
        elif line == "END:VEVENT":
            if record is None or nested:
                raise ValueError("Malformed event boundary")
            records.append(record)
            record = None
        elif record is not None:
            if line.startswith("BEGIN:"):
                nested += 1
            elif line.startswith("END:"):
                nested -= 1
            elif not nested:
                key, separator, value = line.partition(":")
                if not separator:
                    raise ValueError("Malformed event property")
                name, *raw_params = key.split(";")
                params = dict(item.split("=", 1) for item in raw_params)
                params = {key.upper(): value.strip('"') for key, value in params.items()}
                record[name.upper()] = (value, params)
    if record is not None:
        raise ValueError("Incomplete event")

    # The public Meetup feed currently expands recurring dates into individual
    # VEVENTs. Refuse a changed feed format instead of inventing occurrences.
    latest = {}
    for record in records:
        if "RRULE" in record:
            raise ValueError("Meetup returned an unexpanded recurring event")
        uid = record.get("UID", ("", {}))[0]
        if not uid:
            raise ValueError("Event is missing its UID")
        previous = latest.get(uid)
        sequence = int(record.get("SEQUENCE", ("0", {}))[0])
        if previous is None or sequence >= int(previous.get("SEQUENCE", ("0", {}))[0]):
            latest[uid] = record

    events = []
    for uid, record in latest.items():
        if record.get("STATUS", ("", {}))[0].upper() == "CANCELLED":
            continue
        title = text_value(record.get("SUMMARY", ("", {}))[0])
        url = record.get("URL", ("", {}))[0]
        parsed = urlparse(url)
        if not title or parsed.scheme != "https" or parsed.netloc != "www.meetup.com" or not re.fullmatch(r"/gen-ai/events/[A-Za-z0-9_-]+/", parsed.path):
            raise ValueError("Event is missing a title or valid Gen AI Meetup URL")
        start, zone = parse_date(*record["DTSTART"])
        if start <= now:
            continue
        event = {
            "id": uid,
            "title": title,
            "url": url,
            "startsAt": start.astimezone(timezone.utc).isoformat().replace("+00:00", "Z"),
            "timeZone": zone,
            "location": text_value(record.get("LOCATION", ("", {}))[0]),
        }
        if "DTEND" in record:
            end, _ = parse_date(*record["DTEND"])
            if end <= start:
                raise ValueError("Event ends before it starts")
            event["endsAt"] = end.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
        events.append(event)
    return sorted(events, key=lambda event: event["startsAt"])[:10]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, help="Read a local ICS file instead of downloading")
    parser.add_argument("--output", type=Path, default=OUTPUT)
    args = parser.parse_args()
    if args.input:
        source = args.input.read_text(encoding="utf-8")
    else:
        request = Request(SOURCE, headers={"User-Agent": "GenAIMeetupWebsite/1.0", "Accept": "text/calendar"})
        with urlopen(request, timeout=30) as response:
            source = response.read(2_000_001)
            if len(source) > 2_000_000:
                raise ValueError("Calendar exceeds expected size")
            source = source.decode("utf-8-sig")
    now = datetime.now(timezone.utc)
    snapshot = {
        "version": 1,
        "source": SOURCE,
        "refreshedAt": now.isoformat(timespec="seconds").replace("+00:00", "Z"),
        "events": parse_calendar(source, now),
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    temporary = args.output.with_suffix(".json.tmp")
    temporary.write_text(json.dumps(snapshot, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(args.output)
    print(f"Saved {len(snapshot['events'])} upcoming events to {args.output}")


if __name__ == "__main__":
    main()

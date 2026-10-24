# Gen AI Meetup website

Static homepage for [genaimeetup.com](https://genaimeetup.com/), bringing together the Silicon Valley community, the Gen AI Meetup Podcast, and Gen AI Pod on Substack. No build step or runtime dependencies are required.

## Preview

```sh
python3 -m http.server 4173 --bind 127.0.0.1
```

Open [localhost:4173](http://127.0.0.1:4173/). The existing `CNAME` and GitHub Pages structure are preserved. A local preview does not publish changes.

## Homepage

- The hero rotates between a selected Substack article, the latest full YouTube episode, and the next Meetup event. Visitors can select a slide, step forward/backward, or pause. Rotation stops on manual selection or keyboard focus and pauses on hover or background tabs. Reduced-motion preferences disable automatic rotation by default.
- The credibility strip restores the community's **6,000+ members**, **100+ events**, and **50+ podcast episodes** milestones. These are conservative historical milestones, not live counters.
- Upcoming gatherings appear directly on the page, with Pacific times and Meetup RSVP links.
- Watch cards and the original Podbean playlist allow visitors to watch or listen. Podcast platform links remain available if an embed is blocked.
- Substack remains a compact reading section. Subscription links go to Substack's own signup page.
- The logo grid includes the eleven past sponsors and speakers from the original site, plus six podcast guest companies confirmed by the organizer, all in their native brand colors. The default layout has two rows (five columns on desktop, three on tablet, two on phones). Random individual tiles slide upward to reveal an off-grid company, with no duplicate logos visible. Each waiting company appears before a displaced logo returns. The grid rotates automatically without visible controls; reduced-motion and no-JavaScript modes show the full static set. That collective label does not imply every organization sponsored an event.
- The contact form restores the original name, email, interest, and message fields. It posts to the existing FormSubmit destination, with native required-field/email validation and an email alternative.
- The crew section credits the original six organizers and contributors with their existing portraits and LinkedIn links, without assigning unverified current roles.

## Content updates

`index.html` contains essential content, working links, and locally hosted fallback images. `styles.css` controls responsive layouts. `script.js` handles navigation, the hero and logo controls, analytics, and video updates. `events.js` renders the calendar.

### Upcoming events

The old site called a legacy anonymous `corsproxy.io` URL, which now returns HTTP 403 (`keyless_legacy_url`). The browser now requests **same-origin `data/events.json`**; it needs no proxy, API key, or cross-origin calendar request.

Refresh the snapshot with Python 3.10+:

```sh
python3 scripts/refresh_events.py
```

The script fetches [Meetup's public iCalendar](https://www.meetup.com/gen-ai/events/ical/), validates individual dates and links, handles time zones/DST and cancellations, and atomically replaces the saved snapshot only after a successful parse. The current calendar omits venue details. When a location is missing, the website displays the organizer-confirmed city, Sunnyvale, CA; visitors can follow the event link for the venue. Any location supplied by the feed takes precedence.

The browser displays up to three upcoming dates and uses the nearest date in the hero. It checks for a newly published snapshot every five minutes while visible and when a visitor returns to the tab. Past events are filtered out on each refresh. A snapshot older than seven days, a malformed response, or a failed request produces a useful link to Meetup without claiming there are no events. Without JavaScript, a static calendar link remains available. Do not hard-code a recurring schedule or extend dates that are not present in the feed.

### YouTube and audio

```sh
python3 scripts/update-videos.py
```

This saves validated uploads from [the official YouTube RSS feed](https://www.youtube.com/feeds/videos.xml?channel_id=UCnQGeStcP1YuF9mmNSue8dw) in `data/videos.json` and caches thumbnails for the latest two full episodes. Shorts stay in the data but are not used as podcast episodes. The browser reads the snapshot instead of depending on RSS2JSON. Failed feed/image refreshes preserve the existing cards. Titles are rendered as text.

Static HTML fallback cards were checked October 24, 2026; update those periodically as well. Podbean's original playlist embed follows its own feed and does not autoplay. Spotify, Apple Podcasts, and [the podcast archive](https://podcast.genaimeetup.com/) remain linked.

### Automated refresh

`.github/workflows/refresh-content.yml` refreshes both feeds hourly, at minute 17, and supports manual dispatch. It runs parser tests, preserves a failed feed's last successful snapshot, commits successful updates, requests a rebuild of the existing GitHub Pages `main`/root site, and waits for that commit's build to finish. The explicit rebuild matters because bot commits made with `GITHUB_TOKEN` do not trigger a normal Pages build. This is periodic synchronization, not an instant webhook: updates can take an hour plus scheduling, build, and cache delays to appear.

The workflow must be present on the default branch with GitHub Actions enabled and the declared repository/Pages write permissions. Branch protection may require adapting the bot commit step. After publishing a workflow change, verify a manual refresh and the resulting production snapshot.

For local Python.org installations on macOS with an unconfigured CA bundle, use `SSL_CERT_FILE=/etc/ssl/cert.pem python3 scripts/refresh_events.py`. Certificate verification remains enabled.

### Substack

The featured article and two selected reads are editorial selections in `index.html`, not an automatically updating feed. Update URLs, titles, dates, descriptions, and images together.

- [Publication](https://genaipod.substack.com/)
- [Archive](https://genaipod.substack.com/archive)
- [RSS](https://genaipod.substack.com/feed)

### Contact form

The `#contact` section uses the original native `POST` to `https://formsubmit.co/southbaygenai%40gmail.com`. Field names (`name`, `email`, `contactType`, `message`), interest values (`sponsor`, `speaker`, `other`), and hidden settings (`_captcha=false`, `_subject=New Contact Form Submission`) match the original site. FormSubmit handles its own confirmation page. The form works without JavaScript. Header, crew, and footer contact links lead to the form; a direct email alternative remains available.

Verification checks browser validation and intercepts a valid POST locally; it does not send a test email or verify delivery.

## Verification

```sh
python3 -m unittest discover -s tests -p 'test_*.py'
node --check script.js
node --check events.js
```

Browser checks cover the three hero slides and keyboard controls, mobile navigation, horizontal overflow, local images, event-feed failure/staleness/expired dates, and no-JavaScript fallbacks. Review the embedded player with a network connection; third-party privacy settings can block it.

## Accessibility and analytics

Keyboard focus indicators, a skip link, a mobile menu with Escape dismissal, reduced-motion support, slide visibility, and static navigation are included. Logo animation runs automatically while the grid is visible, stops outside the viewport and in background tabs, and shows every logo statically when reduced motion is requested. Original `#sponsors`, `#crew`, `#podcast`, and `#contact` anchors work directly; older `#youtube`, `#upcoming-meetups`, and `#about` links map to the appropriate sections.

Google Analytics loads only on the production domain. Outbound events record destination and section; clicks do not claim completed RSVPs or subscriptions. Asset sources, historical contributor links, and font licenses are recorded in [assets/SOURCES.md](assets/SOURCES.md).

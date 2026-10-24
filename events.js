"use strict";

// The public calendar is refreshed outside the browser. No third-party proxy,
// API key, or calendar parser is needed by a visitor.
(() => {
  const calendarUrl = "https://www.meetup.com/gen-ai/events/";
  const list = document.querySelector("#upcoming-events-list");
  const status = document.querySelector("#events-status");
  if (!list && !document.querySelector("[data-event-title]")) return;
  const maxAge = 7 * 24 * 60 * 60 * 1000;
  let refreshInFlight = false;

  function setText(selector, value) {
    document.querySelectorAll(selector).forEach((node) => {
      node.textContent = value;
    });
  }

  function setHero(event) {
    const start = event && new Date(event.startsAt);
    const options = { timeZone: event?.timeZone || "America/Los_Angeles" };
    const date = start?.toLocaleDateString("en-US", {
      ...options, weekday: "short", month: "short", day: "numeric",
    });
    const time = start?.toLocaleTimeString("en-US", {
      ...options, hour: "numeric", minute: "2-digit", timeZoneName: "short",
    });
    setText("[data-event-title]", event?.title || "Meet the community in person");
    setText("[data-event-date]", event ? `${date} · ${time}` : "Find your next meetup");
    setText("[data-event-location]", event?.location || "Sunnyvale, CA");
    setText("[data-event-month]", start ? start.toLocaleDateString("en-US", { ...options, month: "short" }).toUpperCase() : "LET’S");
    setText("[data-event-day]", start ? start.toLocaleDateString("en-US", { ...options, day: "numeric" }) : "MEET");
    setText("[data-event-cta]", event ? "Details & RSVP" : "Browse the calendar");
    document.querySelectorAll("[data-event-link]").forEach((link) => {
      link.href = event?.url || calendarUrl;
    });
  }

  function element(tag, className, value) {
    const node = document.createElement(tag);
    node.className = className;
    if (value) node.textContent = value;
    return node;
  }

  function renderEvents(events) {
    if (!list) return;
    const cards = events.slice(0, 3).map((event) => {
      const start = new Date(event.startsAt);
      const options = { timeZone: event.timeZone };
      const card = element("a", "meetup-event");
      card.href = event.url;
      card.dataset.channel = "meetup";
      card.dataset.location = "events";
      const date = element("div", "meetup-event-date");
      date.setAttribute("aria-hidden", "true");
      date.append(
        element("span", "meetup-event-month", start.toLocaleDateString("en-US", { ...options, month: "short" }).toUpperCase()),
        element("span", "meetup-event-day", start.toLocaleDateString("en-US", { ...options, day: "numeric" })),
      );
      const details = element("div", "meetup-event-details");
      const time = element("time", "meetup-event-time", start.toLocaleString("en-US", {
        ...options, weekday: "short", month: "short", day: "numeric", year: "numeric",
        hour: "numeric", minute: "2-digit", timeZoneName: "short",
      }));
      time.dateTime = event.startsAt;
      details.append(
        element("h3", "", event.title),
        time,
        element("p", "meetup-event-location", event.location || "Sunnyvale, CA"),
        element("span", "meetup-event-cta", "Details & RSVP ↗"),
      );
      card.append(date, details);
      return card;
    });
    list.replaceChildren(...cards);
  }

  function fallback(message) {
    setHero(null);
    if (status) status.textContent = message;
    if (!list) return;
    const card = element("div", "meetup-events-fallback");
    const link = element("a", "text-link", "See the Meetup calendar ↗");
    link.href = calendarUrl;
    link.dataset.channel = "meetup";
    link.dataset.location = "events";
    card.append(element("p", "", "Good conversations start in person. Find dates, venue details, and RSVPs on Meetup."), link);
    list.replaceChildren(card);
  }

  async function refreshEvents() {
    if (refreshInFlight) return;
    refreshInFlight = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch("data/events.json", { signal: controller.signal, cache: "no-cache" });
      if (!response.ok) throw new Error("Calendar snapshot unavailable");
      const snapshot = await response.json();
      const refreshed = new Date(snapshot.refreshedAt);
      const now = Date.now();
      if (snapshot.version !== 1 || !Array.isArray(snapshot.events) || !Number.isFinite(refreshed.getTime()) || refreshed.getTime() > now + 300000 || now - refreshed.getTime() > maxAge) {
        throw new Error("Calendar snapshot is invalid or out of date");
      }
      const seen = new Set();
      const events = snapshot.events.filter((event) => {
        if (!event || typeof event.title !== "string" || !event.title.trim() || typeof event.url !== "string" || !/^https:\/\/www\.meetup\.com\/gen-ai\/events\/[\w-]+\/$/.test(event.url) || typeof event.startsAt !== "string" || !Number.isFinite(Date.parse(event.startsAt)) || typeof event.timeZone !== "string") {
          throw new Error("Invalid calendar event");
        }
        // Validate the IANA time zone before rendering either hero or list.
        new Intl.DateTimeFormat("en-US", { timeZone: event.timeZone });
        if (Date.parse(event.startsAt) <= now || seen.has(event.url)) return false;
        seen.add(event.url);
        return true;
      }).sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
      if (!events.length) {
        fallback("New dates will appear here when they’re announced. Check Meetup for the latest schedule.");
        return;
      }
      renderEvents(events);
      setHero(events[0]);
      if (status) status.textContent = `Schedule checked ${refreshed.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Los_Angeles" })} · Times are Pacific. Confirm details on Meetup.`;
    } catch {
      // A failed request is not evidence that the group has no upcoming events.
      fallback("Check Meetup for the latest schedule and RSVP details.");
    } finally {
      clearTimeout(timeout);
      refreshInFlight = false;
    }
  }

  refreshEvents();
  // Pick up published updates without requiring visitors to reload the page.
  setInterval(() => {
    if (!document.hidden) refreshEvents();
  }, 5 * 60 * 1000);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) refreshEvents();
  });
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) refreshEvents();
  });
})();

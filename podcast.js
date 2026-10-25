"use strict";

// The hosted RSS feed is refreshed outside the browser. Keep useful static
// links, and any last successful episode, when its local snapshot is unavailable.
(() => {
  const sourceUrl = "https://podcast.genaimeetup.com/feed.xml";

  function timestamp(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return NaN;
    // Date.parse normalizes impossible dates such as February 30. Validate the
    // calendar portion too, rather than displaying a silently corrected date.
    const calendarDate = new Date(`${value.slice(0, 10)}T00:00:00Z`);
    if (!Number.isFinite(calendarDate.getTime())
      || calendarDate.toISOString().slice(0, 10) !== value.slice(0, 10)
      || Number(value.slice(11, 13)) > 23) return NaN;
    return Date.parse(value);
  }

  function safeEpisodeUrl(value) {
    if (typeof value !== "string" || value !== value.trim()) return null;
    try {
      const url = new URL(value);
      if (url.protocol !== "https:" || url.hostname !== "podcast.genaimeetup.com"
        || url.username || url.password || url.port || url.search || url.hash
        || !/^\/e\/[A-Za-z0-9][A-Za-z0-9_-]*\/$/.test(url.pathname)) return null;
      return url.href;
    } catch {
      return null;
    }
  }

  function parseLatestEpisode(snapshot, now = Date.now()) {
    if (!snapshot || typeof snapshot !== "object" || snapshot.sourceUrl !== sourceUrl) return null;
    const updated = timestamp(snapshot.updatedAt);
    const episode = snapshot.latestEpisode;
    if (!Number.isFinite(now) || !Number.isFinite(updated) || updated > now
      || !episode || typeof episode !== "object") return null;
    const published = timestamp(episode.publishedAt);
    const url = safeEpisodeUrl(episode.url);
    if (!url || !Number.isFinite(published) || published > now || published > updated
      || typeof episode.title !== "string" || !episode.title.trim()
      || typeof episode.description !== "string"
      || (episode.durationSeconds !== null && (!Number.isSafeInteger(episode.durationSeconds) || episode.durationSeconds < 0))) return null;
    // Episodes remain useful after publication. There is deliberately no expiry
    // window tied to either the publication date or the last snapshot refresh.
    return {
      title: episode.title.trim(),
      url,
      publishedAt: new Date(published).toISOString(),
      durationSeconds: episode.durationSeconds,
      description: episode.description.trim(),
    };
  }

  function formatDuration(seconds) {
    if (!Number.isSafeInteger(seconds) || seconds <= 0) return "";
    if (seconds < 60) return `${seconds} sec`;
    const minutes = Math.round(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const remainder = minutes % 60;
    if (!hours) return `${minutes} min`;
    return remainder ? `${hours} hr ${remainder} min` : `${hours} hr`;
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { parseLatestEpisode, formatDuration };
  }
  if (typeof document === "undefined"
    || !document.querySelector("[data-podcast-link], [data-podcast-title], [data-podcast-date], [data-podcast-duration], [data-podcast-description]")) return;

  let refreshInFlight = false;

  function setText(selector, value) {
    document.querySelectorAll(selector).forEach(node => { node.textContent = value; });
  }

  function renderEpisode(episode) {
    document.querySelectorAll("[data-podcast-link]").forEach(link => { link.href = episode.url; });
    setText("[data-podcast-title]", episode.title);
    setText("[data-podcast-description]", episode.description);
    setText("[data-podcast-duration]", formatDuration(episode.durationSeconds));
    const displayDate = new Date(episode.publishedAt).toLocaleDateString("en-US", {
      year: "numeric", month: "short", day: "numeric", timeZone: "UTC",
    }).toUpperCase();
    document.querySelectorAll("[data-podcast-date]").forEach(time => {
      time.dateTime = episode.publishedAt;
      time.textContent = displayDate;
    });
  }

  async function refreshPodcast() {
    if (refreshInFlight) return;
    refreshInFlight = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch("data/podcast.json", { signal: controller.signal, cache: "no-cache" });
      if (!response.ok) return;
      const episode = parseLatestEpisode(await response.json());
      if (episode) renderEpisode(episode);
    } catch {
      // Keep the generic archive link or a previously loaded episode intact.
    } finally {
      clearTimeout(timeout);
      refreshInFlight = false;
    }
  }

  refreshPodcast();
  setInterval(() => { if (!document.hidden) refreshPodcast(); }, 5 * 60 * 1000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) refreshPodcast(); });
  window.addEventListener("pageshow", event => {
    if (event.persisted && !document.hidden) refreshPodcast();
  });
})();

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

  function safeEmbedUrl(value) {
    if (typeof value !== "string" || value !== value.trim()) return null;
    try {
      const url = new URL(value);
      if (url.origin !== "https://www.podbean.com" || url.pathname !== "/player-v2/"
        || url.username || url.password || url.hash) return null;
      const params = {
        i: url.searchParams.get("i"), share: "0", download: "0", rtl: "0",
        fonts: "Arial", skin: "1", "font-color": "auto", logo_link: "none",
        "btn-skin": "b92358", size: "150",
      };
      if (!/^[a-z0-9]{1,32}-[a-z0-9]{1,32}$/.test(params.i || "")
        || [...url.searchParams].length !== Object.keys(params).length
        || Object.entries(params).some(([key, value]) => url.searchParams.get(key) !== value)) return null;
      // Normalize approved parameters so query ordering alone never reloads audio.
      return `https://www.podbean.com/player-v2/?${new URLSearchParams(params)}`;
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
    const embedUrl = safeEmbedUrl(episode.embedUrl);
    if (!url || !embedUrl || !Number.isFinite(published) || published > now || published > updated
      || typeof episode.title !== "string" || !episode.title.trim()
      || typeof episode.description !== "string"
      || (episode.durationSeconds !== null && (!Number.isSafeInteger(episode.durationSeconds) || episode.durationSeconds < 0))) return null;
    // Episodes remain useful after publication. There is deliberately no expiry
    // window tied to either the publication date or the last snapshot refresh.
    return {
      title: episode.title.trim(),
      url,
      embedUrl,
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
    || !document.querySelector("[data-podcast-link], [data-podcast-title], [data-podcast-date], [data-podcast-duration], [data-podcast-description], [data-podcast-player]")) return;

  const player = document.querySelector("iframe[data-podcast-player]");
  let refreshInFlight = false;
  let episodePinned = false;
  let pendingEpisode = null;

  function setText(selector, value) {
    document.querySelectorAll(selector).forEach(node => { node.textContent = value; });
  }

  function renderEpisode(episode) {
    // Assigning even the same src reloads an iframe and resets its audio position.
    if (player && safeEmbedUrl(player.src) !== episode.embedUrl) player.src = episode.embedUrl;
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
      if (episode) {
        if (episodePinned) pendingEpisode = episode;
        else renderEpisode(episode);
      }
    } catch {
      // Keep the generic archive link or a previously loaded episode intact.
    } finally {
      clearTimeout(timeout);
      refreshInFlight = false;
    }
  }

  window.addEventListener("message", event => {
    if (!player?.contentWindow || event.origin !== "https://www.podbean.com"
      || event.source !== player.contentWindow || !safeEmbedUrl(player.src)
      || !event.data || typeof event.data !== "object") return;
    if (event.data.event === "PB.Widget.Events.PLAY") {
      episodePinned = true;
      document.dispatchEvent(new CustomEvent("podcast:play"));
    } else if (event.data.event === "PB.Widget.Events.FINISH") {
      episodePinned = false;
      if (pendingEpisode) {
        const episode = pendingEpisode;
        pendingEpisode = null;
        renderEpisode(episode);
      }
    }
    // PAUSE deliberately keeps the episode pinned so resuming never changes it.
  });

  refreshPodcast();
  setInterval(() => { if (!document.hidden) refreshPodcast(); }, 5 * 60 * 1000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) refreshPodcast(); });
  window.addEventListener("pageshow", event => {
    if (event.persisted && !document.hidden) refreshPodcast();
  });
})();

"use strict";

// These events measure intent on our website, not completed RSVPs,
// subscriptions, email delivery, or playback inside the Podbean iframe.
(() => {
  const eventNames = Object.freeze({
    meetup: "meetup_click",
    podcast: "podcast_click",
    youtube: "youtube_click",
    substack: "substack_click",
    discord: "discord_click",
    email: "email_click",
  });
  const sections = new Set([
    "navigation", "hero", "hero-article", "hero-video", "hero-event", "hero-podcast", "hero-discuss", "podcast",
    "events", "watch", "video", "spotify", "apple", "all-episodes",
    "player-fallback", "reading", "article", "contact", "footer",
  ]);
  const domains = {
    meetup: new Set(["meetup.com", "www.meetup.com"]),
    podcast: new Set(["open.spotify.com", "podcasts.apple.com", "podcast.genaimeetup.com"]),
    youtube: new Set(["youtube.com", "www.youtube.com", "youtu.be"]),
    substack: new Set(["genaipod.substack.com"]),
    discord: new Set(["discadia.com", "discord.com", "discord.gg"]),
  };

  function send(name, parameters) {
    if (typeof window.gtag !== "function") return;
    try {
      window.gtag("event", name, { ...parameters, transport_type: "beacon" });
    } catch {
      // Analytics must never prevent navigation or submitting the contact form.
    }
  }

  function describeLink(link) {
    const channel = link.dataset.channel;
    if (!Object.hasOwn(eventNames, channel)) return null;
    const parameters = {
      channel,
      page_section: sections.has(link.dataset.location) ? link.dataset.location : "other",
    };
    let url;
    try {
      url = new URL(link.href, window.location.href);
    } catch {
      return null;
    }
    if (channel === "email") {
      if (url.protocol !== "mailto:") return null;
      // Never collect the email address, subject, body, or other mailto fields.
      return { ...parameters, action_type: "contact_email", link_url: "mailto:", destination: "mailto:" };
    }
    if (url.protocol !== "https:" || url.username || url.password || !domains[channel].has(url.hostname)) return null;

    // Only recognized public content paths are copied. Query strings and
    // fragments are discarded, except the validated YouTube video identifier.
    const safeUrl = new URL(url.origin);
    let match;
    if (channel === "meetup") {
      if ((match = url.pathname.match(/^\/gen-ai\/events\/(\d{1,20})\/?$/))) {
        parameters.action_type = "event_rsvp";
        parameters.content_id = match[1];
        safeUrl.pathname = `/gen-ai/events/${match[1]}/`;
      } else if (/^\/gen-ai\/events\/?$/.test(url.pathname)) {
        parameters.action_type = "calendar";
        safeUrl.pathname = "/gen-ai/events/";
      } else {
        parameters.action_type = "group";
        safeUrl.pathname = "/gen-ai/";
      }
    } else if (channel === "youtube") {
      const pathVideo = url.hostname === "youtu.be"
        ? url.pathname.slice(1)
        : url.pathname.match(/^\/(?:shorts|live)\/([\w-]{11})\/?$/)?.[1];
      const videoId = url.pathname === "/watch" ? url.searchParams.get("v") : pathVideo;
      if (typeof videoId === "string" && /^[\w-]{11}$/.test(videoId)) {
        parameters.action_type = "video";
        parameters.content_id = videoId;
        safeUrl.pathname = url.pathname;
        if (url.pathname === "/watch") safeUrl.searchParams.set("v", videoId);
      } else {
        parameters.action_type = "channel";
        if (/^\/@[\w.-]{1,64}\/?$/.test(url.pathname) || /^\/channel\/[\w-]{1,64}\/?$/.test(url.pathname)) {
          safeUrl.pathname = url.pathname;
        }
      }
    } else if (channel === "substack") {
      if (/^\/subscribe\/?$/.test(url.pathname)) {
        parameters.action_type = "subscribe";
        safeUrl.pathname = "/subscribe";
      } else if ((match = url.pathname.match(/^\/p\/([a-z0-9][a-z0-9-]{0,99})\/?$/i))) {
        parameters.action_type = "article";
        parameters.content_id = match[1];
        safeUrl.pathname = `/p/${match[1]}`;
      } else {
        parameters.action_type = "publication";
        if (/^\/archive\/?$/.test(url.pathname)) safeUrl.pathname = "/archive";
      }
    } else if (channel === "podcast") {
      parameters.action_type = "podcast_open";
      parameters.podcast_platform = url.hostname === "open.spotify.com" ? "spotify"
        : url.hostname === "podcasts.apple.com" ? "apple" : "archive";
      if (/^\/show\/[a-z0-9]{1,64}\/?$/i.test(url.pathname)
        || /^\/[a-z]{2}\/podcast\/[a-z0-9-]{1,100}\/id\d{1,20}\/?$/i.test(url.pathname)) {
        safeUrl.pathname = url.pathname;
      }
    } else {
      parameters.action_type = "community";
      if (/^\/gen-ai\/?$/.test(url.pathname) || /^\/invite\/[\w-]{1,32}\/?$/.test(url.pathname)
        || (url.hostname === "discord.gg" && /^\/[\w-]{1,32}\/?$/.test(url.pathname))) {
        safeUrl.pathname = url.pathname;
      }
    }
    return {
      ...parameters,
      link_domain: safeUrl.hostname,
      link_url: safeUrl.href,
      destination: safeUrl.href, // Retain the existing parameter for older reports.
    };
  }

  function trackClick(event) {
    if (event.defaultPrevented) return;
    if (event.type === "auxclick" ? event.button !== 1 : event.button != null && event.button !== 0) return;
    const target = event.target?.closest ? event.target : event.target?.parentElement;
    const link = target?.closest("a[data-channel]");
    if (!link) return;
    const parameters = describeLink(link);
    if (parameters) send(eventNames[parameters.channel], parameters);
  }

  // Delegation includes event cards and video links populated after page load.
  document.addEventListener("click", trackClick);
  document.addEventListener("auxclick", trackClick);
  document.addEventListener("submit", (event) => {
    const form = event.target;
    if (event.defaultPrevented || !form?.matches?.("form[data-track-contact]") || !form.checkValidity()) return;
    const contactType = form.elements.namedItem("contactType")?.value;
    if (!["sponsor", "speaker", "other"].includes(contactType)) return;
    send("contact_submit_attempt", {
      channel: "contact",
      page_section: "contact",
      action_type: "contact_submit",
      contact_type: contactType,
    });
  });
})();

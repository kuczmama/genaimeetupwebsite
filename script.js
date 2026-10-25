"use strict";

document.documentElement.classList.add("js");
const menuToggle = document.querySelector(".menu-toggle");
const mainNav = document.querySelector("#main-nav");

function closeMenu() {
  mainNav.classList.remove("is-open");
  menuToggle.setAttribute("aria-expanded", "false");
  menuToggle.querySelector("span").textContent = "+";
}
menuToggle.addEventListener("click", () => {
  const open = mainNav.classList.toggle("is-open");
  menuToggle.setAttribute("aria-expanded", String(open));
  menuToggle.querySelector("span").textContent = open ? "−" : "+";
});
mainNav.addEventListener("click", (event) => {
  if (event.target.closest("a")) closeMenu();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && mainNav.classList.contains("is-open")) {
    closeMenu();
    menuToggle.focus();
  }
});
document.addEventListener("click", (event) => {
  if (!event.target.closest(".site-header")) closeMenu();
});
window.matchMedia("(min-width: 801px)").addEventListener("change", closeMenu);
document.querySelector("#current-year").textContent = new Date().getFullYear();

// Preserve links to sections of the old homepage.
const legacySections = {
  "#youtube": "#watch",
  "#upcoming-meetups": "#events",
  "#about": "#events",
};
function followLegacyAnchor() {
  const target = legacySections[window.location.hash];
  if (target) document.querySelector(target)?.scrollIntoView();
}
followLegacyAnchor();
window.addEventListener("hashchange", followLegacyAnchor);

// The active tab's underline tracks the same clock that advances the carousel.
// Pause the clock during interaction, playback, and time spent away from the card.
const carousel = document.querySelector(".feature-carousel");
const slides = [...carousel.querySelectorAll(".feature-slide")];
const selectors = [...carousel.querySelectorAll("[data-slide]")];
const slideRegion = carousel.querySelector(".feature-slides");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const slideDuration = 7000;
let activeSlide = 0;
let elapsed = 0;
let lastFrameAt = null;
let rotationFrame;
let hovered = false;
let inView = false;
let podcastEngaged = false;

function updateProgress() {
  const progress = reducedMotion.matches ? 1 : Math.min(elapsed / slideDuration, 1);
  carousel.style.setProperty("--slide-progress", String(progress));
}
function pauseClock() {
  cancelAnimationFrame(rotationFrame);
  if (lastFrameAt !== null) elapsed += performance.now() - lastFrameAt;
  lastFrameAt = null;
  updateProgress();
}
function focusHoldsSlide() {
  const focused = document.activeElement;
  if (!carousel.contains(focused)) return false;
  // Pointer-selected tabs can resume after hover ends; keyboard users keep control.
  return !selectors.includes(focused) || focused.matches(":focus-visible");
}
function tickRotation(now) {
  elapsed += now - lastFrameAt;
  lastFrameAt = now;
  if (elapsed >= slideDuration) showSlide(activeSlide + 1);
  updateProgress();
  rotationFrame = requestAnimationFrame(tickRotation);
}
function syncRotation() {
  pauseClock();
  const running = !reducedMotion.matches && !hovered && !document.hidden
    && inView && !podcastEngaged && !focusHoldsSlide();
  slideRegion.setAttribute("aria-live", running ? "off" : "polite");
  if (running) {
    lastFrameAt = performance.now();
    rotationFrame = requestAnimationFrame(tickRotation);
  }
}
function showSlide(index) {
  const nextSlide = (index + slides.length) % slides.length;
  if (nextSlide !== activeSlide) {
    // Podbean's player API pauses audio when its slide is deliberately left.
    slides[activeSlide].querySelector("[data-podcast-player]")?.contentWindow
      ?.postMessage({ action: "PB.Widget.API.PAUSE" }, "https://www.podbean.com");
    podcastEngaged = false;
  }
  activeSlide = nextSlide;
  elapsed = 0;
  slides.forEach((slide, i) => { slide.hidden = i !== activeSlide; });
  selectors.forEach((button, i) => button.setAttribute("aria-pressed", String(i === activeSlide)));
  updateProgress();
}
function chooseSlide(index) {
  pauseClock();
  showSlide(index);
  syncRotation();
}
selectors.forEach(button => button.addEventListener("click", () => chooseSlide(Number(button.dataset.slide))));
carousel.addEventListener("pointerenter", event => {
  if (event.pointerType === "mouse") { hovered = true; syncRotation(); }
});
carousel.addEventListener("pointerleave", event => {
  if (event.pointerType === "mouse") { hovered = false; syncRotation(); }
});
carousel.addEventListener("focusin", syncRotation);
carousel.addEventListener("focusout", () => queueMicrotask(syncRotation));
// podcast.js validates the Podbean message origin and iframe before emitting this.
document.addEventListener("podcast:play", () => { podcastEngaged = true; syncRotation(); });
// Focus can enter the cross-origin player without a focusin event on this page.
window.addEventListener("blur", () => queueMicrotask(syncRotation));
window.addEventListener("focus", syncRotation);
carousel.querySelector(".feature-controls").addEventListener("keydown", event => {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  event.preventDefault();
  const index = event.key === "Home" ? 0 : event.key === "End" ? slides.length - 1 : activeSlide + (event.key === "ArrowRight" ? 1 : -1);
  chooseSlide(index);
  selectors[activeSlide].focus();
});
reducedMotion.addEventListener("change", syncRotation);
document.addEventListener("visibilitychange", syncRotation);
new IntersectionObserver(entries => {
  inView = entries[0].isIntersecting && entries[0].intersectionRatio >= 0.2;
  syncRotation();
}, { threshold: [0, 0.2] }).observe(carousel);
carousel.querySelector(".feature-controls").hidden = false;
syncRotation();

// Each logo rotates inside its own fixed tile until visitors expand the full set.
// Reduced-motion and no-JavaScript visitors start with every company visible.
(() => {
  const section = document.querySelector(".partners-section");
  const grid = section.querySelector(".partner-grid");
  const toggle = section.querySelector(".partner-toggle");
  const partners = [...grid.querySelectorAll(".partner-link")].map(link => {
    const image = link.querySelector("img");
    return {
      src: image?.getAttribute("src") || "",
      name: image?.alt || link.querySelector(".partner-name").textContent,
      wordmark: image ? link.querySelector(".partner-name")?.textContent || "" : "",
      href: link.href,
      label: link.getAttribute("aria-label"), title: link.title,
      action: link.querySelector(".partner-action")?.textContent || "Visit website ↗",
      note: link.querySelector(".partner-note")?.textContent || "",
    };
  });
  let visible = [];
  let tileOrder = [];
  let lastTile = -1;
  let waiting = [];
  let inView = false;
  let timer;
  let pendingSwap;
  let columns;
  let showAll = reducedMotion.matches;

  function shuffle(items) {
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [items[i], items[j]] = [items[j], items[i]];
    }
    return items;
  }
  function logo(index) {
    const panel = document.createElement("div");
    panel.className = "partner-logo";
    function companyName(text = partners[index].name) {
      const name = document.createElement("span");
      name.className = "partner-name";
      name.textContent = text;
      return name;
    }
    if (partners[index].src) {
      const image = new Image(180, 65);
      image.alt = partners[index].name;
      image.src = partners[index].src;
      if (partners[index].wordmark) {
        const brand = document.createElement("div");
        brand.className = "partner-brand";
        image.addEventListener("error", () => brand.replaceWith(companyName()), { once: true });
        brand.append(image, companyName(partners[index].wordmark));
        panel.append(brand);
      } else {
        image.addEventListener("error", () => image.replaceWith(companyName()), { once: true });
        panel.append(image);
      }
    } else {
      panel.append(companyName());
    }
    const action = document.createElement("span");
    action.className = "partner-action";
    action.textContent = partners[index].action;
    if (partners[index].note) {
      const note = document.createElement("span");
      note.className = "partner-note";
      note.textContent = partners[index].note;
      panel.append(note);
    }
    panel.append(action);
    return panel;
  }
  function setDestination(link, index) {
    link.href = partners[index].href;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.setAttribute("aria-label", partners[index].label);
    link.title = partners[index].title;
  }
  function finishSwap() {
    if (!pendingSwap) return;
    const swap = pendingSwap;
    pendingSwap = null;
    swap.animations.forEach(animation => animation.cancel());
    swap.previous.remove();
    swap.next.removeAttribute("aria-hidden");
    setDestination(swap.link, swap.replacement);
  }
  function schedule() {
    clearTimeout(timer);
    if (showAll || reducedMotion.matches || !inView || document.hidden || grid.matches(":hover, :focus-within") || visible.length >= partners.length) return;
    timer = setTimeout(rotateOne, 1700 + Math.random() * 900);
  }
  function render() {
    clearTimeout(timer);
    finishSwap();
    columns = Number(getComputedStyle(grid).getPropertyValue("--partner-columns")) || 5;
    const count = showAll ? partners.length : Math.min(columns * 2, partners.length);
    toggle.setAttribute("aria-expanded", String(showAll));
    toggle.querySelector(".partner-toggle-label").textContent = showAll ? "Show fewer companies" : `Show all ${partners.length} companies`;
    toggle.querySelector(".partner-toggle-icon").textContent = showAll ? "−" : "+";
    visible = partners.map((_, index) => index).slice(0, count);
    // Introduce recognizable names first; the changing tile is still randomized.
    waiting = partners.map((_, index) => index).slice(count);
    tileOrder = [];
    lastTile = -1;
    grid.replaceChildren(...visible.map(index => {
      const tile = document.createElement("li");
      tile.className = "partner-tile";
      const link = document.createElement("a");
      link.className = "partner-link";
      setDestination(link, index);
      link.append(logo(index));
      tile.append(link);
      return tile;
    }));
    schedule();
  }
  async function rotateOne() {
    if (!tileOrder.length) {
      tileOrder = shuffle(visible.map((_, index) => index));
      if (tileOrder.length > 1 && tileOrder[0] === lastTile) [tileOrder[0], tileOrder[1]] = [tileOrder[1], tileOrder[0]];
    }
    const tileIndex = tileOrder.shift();
    lastTile = tileIndex;
    // Show every waiting company before bringing back a displaced logo.
    const replacement = waiting.shift();
    waiting.push(visible[tileIndex]);
    const tile = grid.children[tileIndex];
    const link = tile.firstElementChild;
    const previous = link.firstElementChild;
    const next = logo(replacement);
    next.setAttribute("aria-hidden", "true");
    link.append(next);
    visible[tileIndex] = replacement;
    const timing = { duration: 750, easing: "cubic-bezier(.22, .68, .24, 1)", fill: "forwards" };
    const swap = {
      previous, next, link, replacement,
      animations: [
        previous.animate([{ transform: "translateY(0)" }, { transform: "translateY(-100%)" }], timing),
        next.animate([{ transform: "translateY(100%)" }, { transform: "translateY(0)" }], timing),
      ],
    };
    pendingSwap = swap;
    await Promise.allSettled(swap.animations.map(animation => animation.finished));
    if (pendingSwap !== swap) return;
    finishSwap();
    schedule();
  }
  toggle.addEventListener("click", () => {
    showAll = !showAll;
    render();
  });
  reducedMotion.addEventListener("change", () => {
    if (reducedMotion.matches) showAll = true;
    render();
  });
  // Keep destinations steady while visitors point at or keyboard-focus a logo.
  grid.addEventListener("pointerenter", () => { finishSwap(); schedule(); });
  grid.addEventListener("pointerleave", schedule);
  grid.addEventListener("focusin", () => { finishSwap(); schedule(); });
  grid.addEventListener("focusout", () => { queueMicrotask(schedule); });
  document.addEventListener("visibilitychange", () => { finishSwap(); schedule(); });
  new IntersectionObserver(entries => {
    inView = entries[0].isIntersecting && entries[0].intersectionRatio >= 0.2;
    if (!inView) finishSwap();
    schedule();
  }, { threshold: 0.2 }).observe(grid);
  new ResizeObserver(() => {
    const updated = Number(getComputedStyle(grid).getPropertyValue("--partner-columns"));
    if (updated !== columns) {
      // Expanded tiles can reflow without replacing links or losing focus.
      if (showAll) columns = updated;
      else render();
    }
  }).observe(grid);
  // Warm the small, locally hosted logo pool before the first replacement.
  partners.filter(partner => partner.src).forEach(partner => { const image = new Image(); image.src = partner.src; });
  render();
  section.querySelector(".partner-controls").hidden = false;
})();

// Refresh from the same-origin snapshot generated from YouTube's official feed.
// Keep complete local cards if the refresh or a replacement image is unavailable.
async function refreshVideos() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch("data/videos.json", { signal: controller.signal });
    if (!response.ok) return;
    const data = await response.json();
    if (!Array.isArray(data.videos)) return;
    const seen = new Set();
    const videos = data.videos.filter(video => {
      const published = new Date(video.published);
      if (video.isShort || !/^[\w-]{11}$/.test(video.id) || typeof video.title !== "string" || !video.title.trim() || !Number.isFinite(published.getTime()) || published > new Date() || seen.has(video.id)) return false;
      seen.add(video.id);
      return true;
    }).sort((a, b) => new Date(b.published) - new Date(a.published)).slice(0, 2);
    const cards = document.querySelectorAll(".video-card");
    videos.forEach((video, index) => {
      const card = cards[index];
      if (!card) return;
      const title = video.title.trim();
      const url = `https://www.youtube.com/watch?v=${video.id}`;
      const published = new Date(video.published);
      const dateText = published.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" }).toUpperCase();
      const cover = new Image();
      cover.onload = () => {
        card.querySelector("img").src = cover.src;
        card.querySelector("img").alt = `${title} video thumbnail.`;
        card.querySelector(".video-link").href = url;
        const arrow = document.createElement("span");
        arrow.textContent = "↗";
        arrow.setAttribute("aria-hidden", "true");
        card.querySelector("h3").replaceChildren(document.createTextNode(title + " "), arrow);
        const date = card.querySelector("time");
        date.dateTime = video.published;
        date.textContent = dateText;
        if (index === 0) {
          document.querySelectorAll("[data-feature-video-link]").forEach(link => { link.href = url; });
          const imageLink = document.querySelector(".feature-cover[data-feature-video-link]");
          imageLink.setAttribute("aria-label", `Watch ${title}`);
          document.querySelector("[data-feature-video-title]").textContent = title;
          const heroImage = document.querySelector("[data-feature-video-image]");
          heroImage.src = cover.src;
          heroImage.alt = `${title} video thumbnail.`;
          const heroDate = document.querySelector("[data-feature-video-date]");
          heroDate.dateTime = video.published;
          heroDate.textContent = dateText;
        }
      };
      cover.src = typeof video.localThumbnail === "string" && /^assets\/editorial\/[a-zA-Z0-9_-]+\.jpg$/.test(video.localThumbnail)
        ? video.localThumbnail : `https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`;
    });
  } catch {
    // Static content is always available, including when opened without a server.
  } finally {
    clearTimeout(timeout);
  }
}
refreshVideos();

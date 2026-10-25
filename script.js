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

// One featured destination at a time. Manual interaction stops rotation;
// hovering and background tabs temporarily suspend it. Respect reduced motion.
const carousel = document.querySelector(".feature-carousel");
const slides = [...carousel.querySelectorAll(".feature-slide")];
const selectors = [...carousel.querySelectorAll("[data-slide]")];
const slideRegion = carousel.querySelector(".feature-slides");
const pauseButton = carousel.querySelector("[data-carousel-pause]");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
let activeSlide = 0;
let rotating = !reducedMotion.matches;
let rotationTimer;
let hovered = false;

function scheduleRotation() {
  clearTimeout(rotationTimer);
  if (rotating && !hovered && !document.hidden && (!carousel.contains(document.activeElement) || document.activeElement === pauseButton)) {
    rotationTimer = setTimeout(() => {
      showSlide(activeSlide + 1);
      scheduleRotation();
    }, 7000);
  }
}
function setRotation(enabled) {
  rotating = enabled;
  pauseButton.textContent = enabled ? "Ⅱ" : "▶";
  pauseButton.setAttribute("aria-label", enabled ? "Pause highlight rotation" : "Start highlight rotation");
  slideRegion.setAttribute("aria-live", enabled ? "off" : "polite");
  scheduleRotation();
}
function showSlide(index) {
  activeSlide = (index + slides.length) % slides.length;
  slides.forEach((slide, i) => { slide.hidden = i !== activeSlide; });
  selectors.forEach((button, i) => button.setAttribute("aria-pressed", String(i === activeSlide)));
}
function chooseSlide(index) {
  setRotation(false);
  showSlide(index);
}
selectors.forEach(button => button.addEventListener("click", () => chooseSlide(Number(button.dataset.slide))));
carousel.querySelector("[data-carousel-prev]").addEventListener("click", () => chooseSlide(activeSlide - 1));
carousel.querySelector("[data-carousel-next]").addEventListener("click", () => chooseSlide(activeSlide + 1));
pauseButton.addEventListener("click", () => setRotation(!rotating));
carousel.addEventListener("mouseenter", () => { hovered = true; scheduleRotation(); });
carousel.addEventListener("mouseleave", () => { hovered = false; scheduleRotation(); });
carousel.addEventListener("focusin", (event) => {
  if (event.target !== pauseButton) setRotation(false);
});
carousel.addEventListener("focusout", scheduleRotation);
carousel.querySelector(".feature-controls").addEventListener("keydown", event => {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  event.preventDefault();
  const index = event.key === "Home" ? 0 : event.key === "End" ? slides.length - 1 : activeSlide + (event.key === "ArrowRight" ? 1 : -1);
  chooseSlide(index);
  selectors[activeSlide].focus();
});
reducedMotion.addEventListener("change", () => { if (reducedMotion.matches) setRotation(false); });
document.addEventListener("visibilitychange", scheduleRotation);
carousel.querySelector(".feature-controls").hidden = false;
setRotation(rotating);

// Each logo rotates inside its own fixed tile. Reduced-motion and no-JavaScript
// visitors get the full static set; the default two-row grid rotates automatically.
(() => {
  const section = document.querySelector(".partners-section");
  const grid = section.querySelector(".partner-grid");
  const partners = [...grid.querySelectorAll("img")].map(image => ({
    src: image.getAttribute("src"), name: image.alt, href: image.closest("a").href,
  }));
  let visible = [];
  let tileOrder = [];
  let lastTile = -1;
  let waiting = [];
  let inView = false;
  let timer;
  let pendingSwap;
  let columns;

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
    const image = new Image(180, 65);
    image.alt = partners[index].name;
    image.src = partners[index].src;
    image.addEventListener("error", () => {
      const name = document.createElement("span");
      name.textContent = partners[index].name;
      panel.replaceChildren(name);
    }, { once: true });
    panel.append(image);
    return panel;
  }
  function setDestination(link, index) {
    link.href = partners[index].href;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.setAttribute("aria-label", `Visit ${partners[index].name} website (opens in a new tab)`);
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
    if (reducedMotion.matches || !inView || document.hidden || grid.matches(":hover, :focus-within") || visible.length >= partners.length) return;
    timer = setTimeout(rotateOne, 1700 + Math.random() * 900);
  }
  function render() {
    clearTimeout(timer);
    finishSwap();
    columns = Number(getComputedStyle(grid).getPropertyValue("--partner-columns")) || 5;
    const count = reducedMotion.matches ? partners.length : Math.min(columns * 2, partners.length);
    visible = partners.map((_, index) => index).slice(0, count);
    waiting = shuffle(partners.map((_, index) => index).slice(count));
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
  reducedMotion.addEventListener("change", render);
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
    if (updated !== columns) render();
  }).observe(grid);
  // Warm the small, locally hosted logo pool before the first replacement.
  partners.forEach(partner => { const image = new Image(); image.src = partner.src; });
  render();
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

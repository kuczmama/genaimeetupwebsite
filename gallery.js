"use strict";

// Native scrolling remains available without JavaScript. These controls only
// add deliberate navigation; the gallery never advances or moves focus itself.
(() => {
  const section = document.querySelector("#community-photos");
  if (!section) return;
  const rail = section.querySelector(".photo-gallery");
  const previous = section.querySelector("[data-gallery-prev]");
  const next = section.querySelector("[data-gallery-next]");
  const status = section.querySelector("[data-gallery-status]");
  const slides = [...section.querySelectorAll("figure.photo-slide")];
  if (!rail || !previous || !next || !status || !slides.length) return;

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let frame = 0;
  let positions = [];
  let activeIndex = 0;

  function update() {
    const maximum = Math.max(0, rail.scrollWidth - rail.clientWidth);
    const position = Math.max(0, Math.min(rail.scrollLeft, maximum));
    const origin = rail.getBoundingClientRect().left + rail.clientLeft;
    const padding = parseFloat(getComputedStyle(rail).scrollPaddingLeft) || 0;
    positions = slides.map(slide => Math.max(0, Math.min(
      slide.getBoundingClientRect().left - origin + rail.scrollLeft - padding,
      maximum,
    )));
    activeIndex = positions.reduce((closest, start, index) => (
      Math.abs(start - position) < Math.abs(positions[closest] - position) ? index : closest
    ), 0);
    previous.disabled = position <= 1;
    next.disabled = position >= maximum - 1;
    const label = `${activeIndex + 1} / ${slides.length}`;
    if (status.textContent !== label) status.textContent = label;
  }

  function scheduleUpdate() {
    if (!frame) frame = requestAnimationFrame(() => {
      frame = 0;
      update();
    });
  }

  function goTo(index) {
    rail.scrollTo({
      left: positions[Math.max(0, Math.min(index, slides.length - 1))],
      behavior: reducedMotion.matches ? "auto" : "smooth",
    });
    scheduleUpdate();
  }

  function step(direction) {
    update();
    goTo(activeIndex + direction);
  }

  previous.addEventListener("click", () => step(-1));
  next.addEventListener("click", () => step(1));
  rail.addEventListener("keydown", event => {
    if (event.target !== rail || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey
      || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    update();
    goTo(event.key === "Home" ? 0 : event.key === "End" ? slides.length - 1
      : activeIndex + (event.key === "ArrowRight" ? 1 : -1));
  });
  rail.addEventListener("scroll", scheduleUpdate, { passive: true });
  window.addEventListener("resize", scheduleUpdate, { passive: true });
  new ResizeObserver(scheduleUpdate).observe(rail);

  update();
  previous.hidden = false;
  next.hidden = false;
  status.hidden = false;
  const controls = section.querySelector("[data-gallery-controls]");
  if (controls) controls.hidden = false;
})();

"use strict";

const ARTICLE_FEED = "https://genaipod.substack.com/feed";

function parseArticles(data, now = Date.now()) {
  if (data?.source !== ARTICLE_FEED || !Array.isArray(data.articles)) return [];
  const seen = new Set();
  const articles = data.articles.filter(article => {
    if (!article || typeof article.title !== "string" || !article.title.trim()
      || !/^https:\/\/genaipod\.substack\.com\/p\/[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(article.url)) return false;
    if (typeof article.published !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(article.published)) return false;
    const published = Date.parse(article.published);
    if (!Number.isFinite(published) || published > now || seen.has(article.url)
      || new Date(published).toISOString() !== article.published.replace("Z", ".000Z")) return false;
    seen.add(article.url);
    return true;
  }).sort((a, b) => Date.parse(b.published) - Date.parse(a.published)).slice(0, 2);
  // Keep the complete static selection if a snapshot is incomplete or malformed.
  if (articles.length < 2) return [];
  return articles.map(article => ({
    title: article.title.trim(),
    url: article.url,
    published: article.published,
    description: typeof article.description === "string" ? article.description : "",
    image: /^assets\/editorial\/substack-[a-zA-Z0-9_-]+\.(?:jpg|png|webp|gif)$/.test(article.localThumbnail)
      ? article.localThumbnail : "assets/editorial/podcast-cover.jpg",
  }));
}

if (typeof module !== "undefined" && module.exports) module.exports = { parseArticles };

if (typeof document !== "undefined") (() => {
  const cards = [...document.querySelectorAll("#read .article-card")];
  const hero = document.querySelector("#feature-article");
  if (cards.length !== 2 || !hero) return;

  function setDate(element, article) {
    const date = document.createElement("time");
    date.dateTime = article.published;
    date.textContent = new Date(article.published).toLocaleDateString("en-US", {
      month: "short", day: "numeric", year: "numeric", timeZone: "UTC",
    }).toUpperCase();
    element.replaceChildren(date);
  }

  function setImage(image, article) {
    image.src = article.image;
    // The linked title immediately alongside the image describes the article.
    image.alt = "";
    image.onerror = () => {
      image.onerror = null;
      image.src = "assets/editorial/podcast-cover.jpg";
    };
  }

  function renderArticles(articles) {
    articles.forEach((article, index) => {
      const card = cards[index];
      card.querySelectorAll("a").forEach(link => { link.href = article.url; });
      card.querySelector(".article-image").setAttribute("aria-label", `Read ${article.title}`);
      setImage(card.querySelector("img"), article);
      setDate(card.querySelector(".meta"), article);
      const arrow = document.createElement("span");
      arrow.setAttribute("aria-hidden", "true");
      arrow.textContent = "↗";
      card.querySelector("h3 a").replaceChildren(document.createTextNode(article.title + " "), arrow);
      card.querySelector(".article-info > p:not(.meta)").textContent = article.description;
    });
    const latest = articles[0];
    hero.querySelectorAll("a").forEach(link => { link.href = latest.url; });
    hero.querySelector(".feature-cover").setAttribute("aria-label", `Read ${latest.title}`);
    setImage(hero.querySelector(".feature-cover img"), latest);
    setDate(hero.querySelector(".meta"), latest);
    hero.querySelector("h2 a").textContent = latest.title;
    hero.querySelector(".feature-copy > p:not(.meta)").textContent = latest.description;
  }

  let inFlight = false;
  let renderedSnapshot = "";
  async function refreshArticles() {
    if (inFlight) return;
    inFlight = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch("data/articles.json", { signal: controller.signal, cache: "no-cache" });
      if (!response.ok) return;
      const articles = parseArticles(await response.json());
      const signature = JSON.stringify(articles);
      if (articles.length === 2 && signature !== renderedSnapshot) {
        renderArticles(articles);
        renderedSnapshot = signature;
      }
    } catch {
      // Static cards and the last successful snapshot remain usable offline.
    } finally {
      clearTimeout(timeout);
      inFlight = false;
    }
  }
  refreshArticles();
  setInterval(() => { if (!document.hidden) refreshArticles(); }, 5 * 60 * 1000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) refreshArticles(); });
})();

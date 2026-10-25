const assert = require("node:assert/strict");
const test = require("node:test");
const { parseArticles } = require("../articles.js");

const now = Date.parse("2026-10-24T23:00:00Z");
const source = "https://genaipod.substack.com/feed";
const fallbackImage = "assets/editorial/podcast-cover.jpg";

function article(slug, published, overrides = {}) {
  return {
    title: `Article ${slug}`,
    url: `https://genaipod.substack.com/p/${slug}`,
    published,
    description: "Experiments and lessons from building with AI.",
    localThumbnail: `assets/editorial/substack-${slug}.jpg`,
    ...overrides,
  };
}

function snapshot(articles) {
  return { source, articles };
}

const older = article("earlier-essay", "2026-09-05T12:00:00Z");
const recent = article("recent-essay", "2026-10-19T12:00:00Z");

test("selects the latest two distinct articles chronologically from an unordered feed", () => {
  const latest = article("latest-essay", "2026-10-24T12:00:00Z", {
    title: "  The latest essay  ",
  });
  const data = snapshot([older, latest, { ...latest }, recent]);
  const original = structuredClone(data);
  const result = parseArticles(data, now);

  assert.deepEqual(result.map(item => item.url), [latest.url, recent.url]);
  assert.equal(result[0].title, "The latest essay");
  assert.equal(result[0].published, latest.published);
  assert.equal(result[0].description, latest.description);
  assert.deepEqual(data, original, "Selecting articles must not reorder or modify the snapshot");
});

test("future articles do not displace published articles, including the exact current instant", () => {
  const current = article("just-published", "2026-10-24T23:00:00Z");
  const future = article("scheduled-essay", "2026-10-24T23:00:01Z");
  const result = parseArticles(snapshot([future, older, current]), now);

  assert.deepEqual(result.map(item => item.url), [current.url, older.url]);
});

test("malformed article records are ignored without losing the two valid articles", () => {
  const invalid = [
    null,
    {},
    article("empty-title", "2026-10-23T12:00:00Z", { title: "   " }),
    article("invalid-title", "2026-10-23T12:00:00Z", { title: {} }),
    article("invalid-date", "not a date"),
    article("missing-date", undefined),
    article("missing-url", "2026-10-23T12:00:00Z", { url: undefined }),
  ];

  for (const item of invalid) {
    const result = parseArticles(snapshot([item, older, recent]), now);
    assert.deepEqual(result.map(value => value.url), [recent.url, older.url], JSON.stringify(item));
  }
});

test("invalid calendar dates do not normalize into apparently valid published articles", () => {
  const invalid = article("impossible-date", "2026-02-30T12:00:00Z");
  const result = parseArticles(snapshot([invalid, article("older-valid", "2026-01-20T12:00:00Z")]), now);

  assert.deepEqual(result, []);
});

test("article links must stay within the official publication's HTTPS article pages", () => {
  const invalidUrls = [
    "javascript:alert(1)",
    "http://genaipod.substack.com/p/essay",
    "https://another-publication.substack.com/p/essay",
    "https://genaipod.substack.com.evil.example/p/essay",
    "https://genaipod.substack.com@evil.example/p/essay",
    "https://user:password@genaipod.substack.com/p/essay",
    "https://genaipod.substack.com:8443/p/essay",
    "https://genaipod.substack.com/subscribe",
    "https://genaipod.substack.com/p/",
    "https://genaipod.substack.com/p/../subscribe",
    "https://genaipod.substack.com/p/%2f%2fevil.example",
    "https://genaipod.substack.com/p/essay?redirect=https://evil.example",
  ];

  for (const url of invalidUrls) {
    const candidate = article("untrusted-link", "2026-10-23T12:00:00Z", { url });
    const result = parseArticles(snapshot([candidate, older, recent]), now);
    assert.deepEqual(result.map(value => value.url), [recent.url, older.url], url);
  }
});

test("wrong-source or incomplete snapshots return no replacement for the complete static cards", () => {
  const invalid = [
    undefined,
    null,
    {},
    { articles: [older, recent] },
    { source: "https://another-publication.substack.com/feed", articles: [older, recent] },
    { source: "http://genaipod.substack.com/feed", articles: [older, recent] },
    { source, articles: null },
    { source, articles: {} },
    snapshot([]),
    snapshot([recent]),
    snapshot([recent, { ...recent }]),
    snapshot([recent, article("invalid-second", "not a date")]),
  ];

  for (const data of invalid) {
    assert.deepEqual(parseArticles(data, now), [], JSON.stringify(data));
  }
});

test("published essays remain usable through long publishing gaps", () => {
  const first = article("first-essay", "2020-03-01T12:00:00Z");
  const second = article("second-essay", "2023-05-01T12:00:00Z");
  const result = parseArticles(snapshot([first, second]), Date.parse("2035-01-01T00:00:00Z"));

  assert.deepEqual(result.map(item => item.url), [second.url, first.url]);
});

test("approved local JPG, PNG, WebP, and GIF thumbnails are retained", () => {
  for (const extension of ["jpg", "png", "webp", "gif"]) {
    const localThumbnail = `assets/editorial/substack-essay_42.${extension}`;
    const result = parseArticles(snapshot([older, { ...recent, localThumbnail }]), now);
    assert.equal(result[0].image, localThumbnail);
  }
});

test("unsafe or missing thumbnail paths use the podcast cover without discarding valid articles", () => {
  const unsafePaths = [
    undefined,
    null,
    {},
    "",
    "https://images.example/essay.jpg",
    "//images.example/essay.jpg",
    "data:image/svg+xml,<svg></svg>",
    "/assets/editorial/substack-essay.jpg",
    "../assets/editorial/substack-essay.jpg",
    "assets/editorial/../substack-essay.jpg",
    "assets/editorial/substack-../essay.jpg",
    "assets/editorial/substack-%2e%2e.jpg",
    "assets/editorial/substack-essay.svg",
    "assets/editorial/substack-essay.jpg?redirect=elsewhere",
    "assets/crew/substack-essay.jpg",
    "assets/editorial/unrelated-essay.jpg",
  ];

  for (const localThumbnail of unsafePaths) {
    const result = parseArticles(snapshot([older, { ...recent, localThumbnail }]), now);
    assert.equal(result.length, 2, JSON.stringify(localThumbnail));
    assert.equal(result[0].image, fallbackImage, JSON.stringify(localThumbnail));
    assert.equal(result[0].url, recent.url);
  }
});

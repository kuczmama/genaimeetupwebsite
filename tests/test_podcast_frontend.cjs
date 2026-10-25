const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const { parseLatestEpisode, formatDuration } = require("../podcast.js");

const source = fs.readFileSync(path.join(__dirname, "../podcast.js"), "utf8");
const now = Date.parse("2026-10-24T23:00:00Z");
function snapshot() {
  return {
    sourceUrl: "https://podcast.genaimeetup.com/feed.xml",
    updatedAt: "2026-10-24T22:00:00Z",
    latestEpisode: {
      title: "Mario plus Red Dead Redemption?! Reverse Engineering AI",
      url: "https://podcast.genaimeetup.com/e/mario-plus-red-dead-redemption-reverse-engineering-ai/",
      publishedAt: "2026-10-20T12:54:20Z",
      durationSeconds: 5735,
      description: "A conversation about building with AI.",
    },
  };
}

test("published episodes remain available through long publishing gaps", () => {
  const data = snapshot();
  const episode = parseLatestEpisode(data, Date.parse("2027-03-01T00:00:00Z"));
  assert.equal(episode.url, data.latestEpisode.url);
  assert.equal(episode.title, data.latestEpisode.title);
});

test("episode links cannot navigate outside the official episode archive", () => {
  const values = [
    "javascript:alert(1)", "http://podcast.genaimeetup.com/e/episode/",
    "https://podcast.genaimeetup.com.evil.example/e/episode/",
    "https://podcast.genaimeetup.com@evil.example/e/episode/",
    "https://user:password@podcast.genaimeetup.com/e/episode/",
    "https://podcast.genaimeetup.com:8443/e/episode/",
    "https://podcast.genaimeetup.com/e/episode/?redirect=https://evil.example",
    "https://podcast.genaimeetup.com/e/%2f%2fevil.example/",
    "https://podcast.genaimeetup.com/feed.xml",
  ];
  for (const url of values) {
    const data = snapshot();
    data.latestEpisode.url = url;
    assert.equal(parseLatestEpisode(data, now), null, url);
  }
});

test("malformed records and future timestamps do not replace fallback content", () => {
  for (const data of [null, {}, { sourceUrl: "https://unrelated.example/feed.xml" }]) {
    assert.equal(parseLatestEpisode(data, now), null);
  }
  const changes = [
    data => { data.latestEpisode = null; },
    data => { data.latestEpisode.title = "  "; },
    data => { data.latestEpisode.description = {}; },
    data => { data.latestEpisode.publishedAt = "not a date"; },
    data => { data.latestEpisode.publishedAt = "2026-02-30T12:00:00Z"; },
    data => { data.latestEpisode.publishedAt = "2026-10-20T24:00:00Z"; },
    data => { data.latestEpisode.publishedAt = "2026-10-25T00:00:00Z"; },
    data => { data.updatedAt = "2026-10-25T00:00:00Z"; },
    data => { data.updatedAt = "2026-10-24"; },
    data => { data.latestEpisode.durationSeconds = -1; },
    data => { data.latestEpisode.durationSeconds = "5735"; },
    data => { data.latestEpisode.durationSeconds = Infinity; },
  ];
  for (const change of changes) {
    const data = snapshot();
    change(data);
    assert.equal(parseLatestEpisode(data, now), null);
  }
});

test("duration labels round naturally without displaying zero or unknown durations", () => {
  for (const [seconds, expected] of [[5735, "1 hr 36 min"], [3600, "1 hr"], [3599, "1 hr"], [120, "2 min"], [45, "45 sec"], [0, ""], [null, ""], [-1, ""]]) {
    assert.equal(formatDuration(seconds), expected);
  }
  const data = snapshot();
  data.latestEpisode.durationSeconds = null;
  assert.equal(parseLatestEpisode(data, now).durationSeconds, null);
});

function setup(fetchResponse) {
  const listeners = new Map();
  const intervals = [];
  const requests = [];
  const nodes = new Map();
  for (const key of ["link", "title", "date", "duration", "description"]) {
    const node = { textContent: `Fallback ${key}`, href: "https://podcast.genaimeetup.com/", dateTime: "" };
    Object.defineProperty(node, "innerHTML", { set() { throw new Error("Feed HTML must never be rendered"); } });
    nodes.set(`[data-podcast-${key}]`, [node]);
  }
  nodes.get("[data-podcast-link]").push({ href: "https://podcast.genaimeetup.com/" });
  const document = {
    hidden: false,
    querySelector: () => nodes.get("[data-podcast-link]")[0],
    querySelectorAll: selector => nodes.get(selector) || [],
    addEventListener: (type, listener) => listeners.set(type, listener),
  };
  const window = { addEventListener: (type, listener) => listeners.set(type, listener) };
  vm.runInNewContext(source, {
    document, window, URL, AbortController,
    fetch: (...args) => { requests.push(args); return fetchResponse(...args); },
    setTimeout: () => 1, clearTimeout() {},
    setInterval: (callback, delay) => intervals.push({ callback, delay }),
  });
  return { nodes, document, requests, intervals, dispatch: (type, event = {}) => listeners.get(type)?.(event) };
}
const flush = () => new Promise(resolve => setImmediate(resolve));
const response = data => ({ ok: true, json: async () => data });

test("the shipped script updates every marked link and renders feed text without interpreting markup", async () => {
  const data = snapshot();
  data.latestEpisode.title = "AI <script>alert(1)</script>";
  data.latestEpisode.description = "<img src=x onerror=alert(1)>";
  const app = setup(async () => response(data));
  await flush();
  assert.deepEqual(app.nodes.get("[data-podcast-link]").map(node => node.href), [data.latestEpisode.url, data.latestEpisode.url]);
  assert.equal(app.nodes.get("[data-podcast-title]")[0].textContent, data.latestEpisode.title);
  assert.equal(app.nodes.get("[data-podcast-description]")[0].textContent, data.latestEpisode.description);
  assert.equal(app.nodes.get("[data-podcast-date]")[0].textContent, "OCT 20, 2026");
  assert.equal(app.nodes.get("[data-podcast-date]")[0].dateTime, "2026-10-20T12:54:20.000Z");
  assert.equal(app.nodes.get("[data-podcast-duration]")[0].textContent, "1 hr 36 min");
  assert.equal(app.requests[0][0], "data/podcast.json");
  assert.equal(app.requests[0][1].cache, "no-cache");
});

test("network, HTTP, JSON, and validation failures keep generic fallback links intact", async () => {
  const failures = [
    async () => { throw new Error("offline"); },
    async () => ({ ok: false }),
    async () => ({ ok: true, json: async () => { throw new SyntaxError("bad JSON"); } }),
    async () => response({}),
  ];
  for (const fetchResponse of failures) {
    const app = setup(fetchResponse);
    await flush();
    assert.equal(app.nodes.get("[data-podcast-title]")[0].textContent, "Fallback title");
    assert.ok(app.nodes.get("[data-podcast-link]").every(node => node.href === "https://podcast.genaimeetup.com/"));
  }
});

test("a later failed refresh retains the already loaded episode", async () => {
  let fail = false;
  const app = setup(async () => {
    if (fail) throw new Error("offline");
    return response(snapshot());
  });
  await flush();
  fail = true;
  app.dispatch("visibilitychange");
  await flush();
  assert.equal(app.nodes.get("[data-podcast-title]")[0].textContent, snapshot().latestEpisode.title);
  assert.equal(app.nodes.get("[data-podcast-link]")[0].href, snapshot().latestEpisode.url);
});

test("tab and history refreshes never duplicate an in-flight request, and hidden tabs stay idle", async () => {
  let resolve;
  const pending = new Promise(done => { resolve = done; });
  const app = setup(() => pending);
  assert.equal(app.intervals[0].delay, 300000);
  app.intervals[0].callback();
  app.dispatch("visibilitychange");
  app.dispatch("pageshow", { persisted: true });
  assert.equal(app.requests.length, 1);
  resolve(response(snapshot()));
  await flush();
  app.document.hidden = true;
  app.intervals[0].callback();
  app.dispatch("visibilitychange");
  app.dispatch("pageshow", { persisted: true });
  assert.equal(app.requests.length, 1);
  app.document.hidden = false;
  app.dispatch("visibilitychange");
  await flush();
  assert.equal(app.requests.length, 2);
  app.dispatch("pageshow", { persisted: false });
  assert.equal(app.requests.length, 2);
  app.dispatch("pageshow", { persisted: true });
  await flush();
  assert.equal(app.requests.length, 3);
});

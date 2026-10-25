const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const { parseLatestEpisode, formatDuration } = require("../podcast.js");

const source = fs.readFileSync(path.join(__dirname, "../podcast.js"), "utf8");
const now = Date.parse("2026-10-24T23:00:00Z");
const embed = (id = "tniji-1b8c456") => `https://www.podbean.com/player-v2/?i=${id}&share=0&download=0&rtl=0&fonts=Arial&skin=1&font-color=auto&logo_link=none&btn-skin=b92358&size=150`;
function snapshot() {
  return {
    sourceUrl: "https://podcast.genaimeetup.com/feed.xml",
    updatedAt: "2026-10-24T22:00:00Z",
    latestEpisode: {
      title: "Mario plus Red Dead Redemption?! Reverse Engineering AI",
      url: "https://podcast.genaimeetup.com/e/mario-plus-red-dead-redemption-reverse-engineering-ai/",
      embedUrl: embed(),
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

test("only the approved Podbean episode embed and exact player options are accepted", () => {
  const invalid = [
    "javascript:alert(1)",
    embed().replace("https:", "http:"),
    embed().replace("www.podbean.com", "www.podbean.com.evil.example"),
    embed().replace("www.podbean.com", "user:password@www.podbean.com"),
    embed().replace("www.podbean.com", "www.podbean.com:8443"),
    embed().replace("player-v2/", "player/"),
    embed("daq9r-11101d0-pbblog-playlist"),
    embed().replace("&share=0", ""),
    embed().replace("&share=0", "&share=0&share=0"),
    embed().replace("logo_link=none", "logo_link=episode_page"),
    embed().replace("size=150", "size=500"),
    `${embed()}&autoplay=1`,
    `${embed()}#fragment`,
  ];
  for (const embedUrl of invalid) {
    const data = snapshot();
    data.latestEpisode.embedUrl = embedUrl;
    assert.equal(parseLatestEpisode(data, now), null, embedUrl);
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

function setup(fetchResponse, initialSrc = embed(), { intersectionObserver = true } = {}) {
  const listeners = new Map();
  const intervals = [];
  const requests = [];
  const emitted = [];
  const observers = [];
  function eventTarget(handlers = new Map()) {
    return {
      addEventListener(type, listener, options = {}) {
        if (!handlers.has(type)) handlers.set(type, []);
        handlers.get(type).push({ listener, once: options.once });
      },
      dispatchEvent(event) {
        const current = [...(handlers.get(event.type) || [])];
        handlers.set(event.type, current.filter(handler => !handler.once));
        for (const { listener } of current) listener(event);
        return true;
      },
    };
  }
  function iframe(initial) {
    let src = initial;
    let loading = "lazy";
    const srcWrites = [];
    const loadingWrites = [];
    return {
      ...eventTarget(), contentWindow: {}, srcWrites, loadingWrites,
      get src() { return src; },
      set src(value) { srcWrites.push(value); src = value; },
      get loading() { return loading; },
      set loading(value) { loadingWrites.push(value); loading = value; },
      getAttribute(name) { return this[name] ?? null; },
      setAttribute(name, value) { this[name] = value; },
    };
  }
  const player = iframe(initialSrc);
  const playlist = iframe("https://www.podbean.com/player-v2/?i=daq9r-11101d0-pbblog-playlist&size=500");
  const listenTab = eventTarget();
  const watchHeading = {};
  const nodes = new Map();
  for (const key of ["link", "title", "date", "duration", "description"]) {
    const node = { textContent: `Fallback ${key}`, href: "https://podcast.genaimeetup.com/", dateTime: "" };
    Object.defineProperty(node, "innerHTML", { set() { throw new Error("Feed HTML must never be rendered"); } });
    nodes.set(`[data-podcast-${key}]`, [node]);
  }
  nodes.get("[data-podcast-link]").push({ href: "https://podcast.genaimeetup.com/" });
  nodes.set("iframe[data-podcast-player]", [player]);
  nodes.set("iframe[data-podcast-playlist]", [playlist]);
  nodes.set('[aria-controls="feature-podcast"]', [listenTab]);
  nodes.set("#watch .section-heading", [watchHeading]);
  const documentEvents = eventTarget(listeners);
  const document = {
    hidden: false,
    querySelector: selector => selector.split(",").map(part => nodes.get(part.trim())?.[0]).find(Boolean) || null,
    querySelectorAll: selector => nodes.get(selector) || [],
    addEventListener: documentEvents.addEventListener,
    dispatchEvent: event => { emitted.push(event); return documentEvents.dispatchEvent(event); },
  };
  const window = eventTarget(listeners);
  class MockIntersectionObserver {
    constructor(callback, options) {
      this.callback = callback;
      this.options = options;
      this.observed = [];
      this.disconnects = 0;
      observers.push(this);
    }
    observe(target) { this.observed.push(target); }
    disconnect() { this.disconnects++; }
    emit(entries) { this.callback(entries, this); }
  }
  const observerGlobals = intersectionObserver ? { IntersectionObserver: MockIntersectionObserver } : {};
  Object.assign(window, observerGlobals);
  const context = {
    ...observerGlobals,
    document, window, URL, URLSearchParams, AbortController,
    CustomEvent: class { constructor(type) { this.type = type; } },
    fetch: (...args) => { requests.push(args); return fetchResponse(...args); },
    setTimeout: () => 1, clearTimeout() {},
    setInterval: (callback, delay) => intervals.push({ callback, delay }),
  };
  vm.runInNewContext(source, context);
  return {
    nodes, player, playlist, listenTab, watchHeading, observers,
    srcWrites: player.srcWrites, emitted, document, requests, intervals,
    dispatch: (type, event = {}) => documentEvents.dispatchEvent({ ...event, type }),
  };
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

test("the old schema leaves static player and generic metadata unchanged", async () => {
  const data = snapshot();
  delete data.latestEpisode.embedUrl;
  assert.equal(parseLatestEpisode(data, now), null);
  const app = setup(async () => response(data));
  await flush();
  assert.equal(app.nodes.get("[data-podcast-title]")[0].textContent, "Fallback title");
  assert.ok(app.nodes.get("[data-podcast-link]").every(node => node.href === "https://podcast.genaimeetup.com/"));
  assert.deepEqual(app.srcWrites, []);
});

test("repeated refreshes preserve the iframe, including equivalent query ordering", async () => {
  const initial = embed().replace("i=tniji-1b8c456&", "") + "&i=tniji-1b8c456";
  const app = setup(async () => response(snapshot()), initial);
  await flush();
  app.intervals[0].callback();
  await flush();
  assert.deepEqual(app.srcWrites, []);
  assert.equal(app.player.src, initial);
});

test("the hero player stays lazy until its preload hint, without reloading its source", async () => {
  const app = setup(async () => response(snapshot()));
  await flush();
  assert.equal(app.player.loading, "lazy");
  assert.equal(app.playlist.loading, "lazy");
  assert.deepEqual(app.player.loadingWrites, []);
  for (let i = 0; i < 3; i++) app.document.dispatchEvent({ type: "podcast:preload" });
  assert.equal(app.player.loading, "eager");
  assert.deepEqual(app.player.loadingWrites, ["eager"]);
  assert.deepEqual(app.srcWrites, []);
  assert.equal(app.player.src, embed());
  assert.equal(app.playlist.loading, "lazy");
  assert.equal(app.requests.length, 1, "Preloading must not trigger extra feed requests");
});

test("each Listen tab intent hint preloads once and repeated hints preserve the iframe", async () => {
  const hints = ["pointerenter", "focus", "pointerdown"];
  for (const firstHint of hints) {
    const app = setup(async () => response(snapshot()));
    await flush();
    assert.equal(app.player.loading, "lazy");
    app.listenTab.dispatchEvent({ type: firstHint });
    assert.equal(app.player.loading, "eager", firstHint);
    for (const type of hints) app.listenTab.dispatchEvent({ type });
    app.document.dispatchEvent({ type: "podcast:preload" });
    assert.deepEqual(app.player.loadingWrites, ["eager"], firstHint);
    assert.deepEqual(app.srcWrites, [], firstHint);
    assert.equal(app.playlist.loading, "lazy");
  }
});

for (const trigger of ["watchHeading", "playlist"]) {
  test(`the ${trigger === "watchHeading" ? "Watch heading" : "direct playlist anchor"} preloads the playlist and disconnects observation`, async () => {
    const app = setup(async () => response(snapshot()));
    await flush();
    assert.equal(app.observers.length, 1);
    const observer = app.observers[0];
    assert.deepEqual(new Set(observer.observed), new Set([app.watchHeading, app.playlist]));
    observer.emit([{ target: app.watchHeading, isIntersecting: false }, { target: app.playlist, isIntersecting: false }]);
    assert.equal(app.playlist.loading, "lazy");
    assert.equal(observer.disconnects, 0);
    observer.emit([{ target: app[trigger], isIntersecting: true }]);
    assert.equal(app.playlist.loading, "eager");
    assert.equal(observer.disconnects, 1);
    // A queued callback may still arrive after disconnect; no source reload or
    // second eager write should disturb a player that is already loading.
    observer.emit([{ target: app.playlist, isIntersecting: true }]);
    assert.deepEqual(app.playlist.loadingWrites, ["eager"]);
    assert.deepEqual(app.playlist.srcWrites, []);
    assert.equal(app.player.loading, "lazy");
    assert.deepEqual(app.srcWrites, []);
  });
}

test("browsers without IntersectionObserver eagerly load the playlist while retaining the lazy hero", async () => {
  const app = setup(async () => response(snapshot()), embed(), { intersectionObserver: false });
  await flush();
  assert.equal(app.observers.length, 0);
  assert.equal(app.playlist.loading, "eager");
  assert.deepEqual(app.playlist.loadingWrites, ["eager"]);
  assert.deepEqual(app.playlist.srcWrites, []);
  assert.equal(app.player.loading, "lazy");
  assert.deepEqual(app.srcWrites, []);
});

function widgetEvent(app, name, overrides = {}) {
  app.dispatch("message", {
    origin: "https://www.podbean.com",
    source: app.player.contentWindow,
    data: { event: `PB.Widget.Events.${name}` },
    ...overrides,
  });
}
function nextEpisode(id, title) {
  const data = snapshot();
  data.latestEpisode.url = `https://podcast.genaimeetup.com/e/${title.toLowerCase().replaceAll(" ", "-")}/`;
  data.latestEpisode.embedUrl = embed(id);
  data.latestEpisode.title = title;
  return data;
}

test("PLAY and PAUSE pin the episode until FINISH applies the newest pending update", async () => {
  let data = snapshot();
  const app = setup(async () => response(data));
  await flush();
  widgetEvent(app, "PLAY");
  assert.deepEqual(app.emitted.map(event => event.type), ["podcast:play"]);
  app.document.dispatchEvent({ type: "podcast:preload" });
  app.listenTab.dispatchEvent({ type: "pointerenter" });
  assert.deepEqual(app.player.loadingWrites, ["eager"]);
  data = nextEpisode("abcde-12345", "A new conversation");
  app.intervals[0].callback();
  await flush();
  assert.equal(app.nodes.get("[data-podcast-title]")[0].textContent, snapshot().latestEpisode.title);
  assert.equal(app.nodes.get("[data-podcast-link]")[0].href, snapshot().latestEpisode.url);
  assert.deepEqual(app.srcWrites, []);
  widgetEvent(app, "PAUSE");
  app.listenTab.dispatchEvent({ type: "focus" });
  assert.deepEqual(app.player.loadingWrites, ["eager"]);
  data = nextEpisode("fghij-67890", "The newest conversation");
  app.intervals[0].callback();
  await flush();
  assert.deepEqual(app.srcWrites, []);
  assert.equal(app.nodes.get("[data-podcast-title]")[0].textContent, snapshot().latestEpisode.title);
  widgetEvent(app, "FINISH");
  assert.deepEqual(app.srcWrites, [data.latestEpisode.embedUrl]);
  assert.equal(app.nodes.get("[data-podcast-title]")[0].textContent, data.latestEpisode.title);
  assert.equal(app.nodes.get("[data-podcast-link]")[0].href, data.latestEpisode.url);
  widgetEvent(app, "FINISH");
  assert.equal(app.srcWrites.length, 1);
});

test("forged widget messages cannot pin playback, release it, or stop the carousel", async () => {
  const forgeries = [
    { origin: "https://evil.example" },
    { origin: "https://www.podbean.com.evil.example" },
    { source: {} },
    { source: null },
    { data: { event: "PLAY" } },
    { data: "PB.Widget.Events.PLAY" },
    { data: null },
  ];
  let data = snapshot();
  const app = setup(async () => response(data));
  await flush();
  for (const forgery of forgeries) widgetEvent(app, "PLAY", forgery);
  assert.equal(app.emitted.length, 0);
  data = nextEpisode("abcde-12345", "A new conversation");
  app.intervals[0].callback();
  await flush();
  assert.equal(app.player.src, data.latestEpisode.embedUrl);
  widgetEvent(app, "PLAY");
  data = nextEpisode("fghij-67890", "The newest conversation");
  app.intervals[0].callback();
  await flush();
  widgetEvent(app, "FINISH", { origin: "https://evil.example" });
  widgetEvent(app, "FINISH", { source: {} });
  assert.equal(app.srcWrites.length, 1);
  assert.equal(app.nodes.get("[data-podcast-title]")[0].textContent, "A new conversation");
  widgetEvent(app, "FINISH");
  assert.equal(app.player.src, data.latestEpisode.embedUrl);
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

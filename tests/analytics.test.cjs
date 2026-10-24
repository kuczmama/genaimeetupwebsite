const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../analytics.js"), "utf8");

// Execute the shipped script, with only the DOM surface used by the listeners.
// No Google Analytics or contact-form requests leave this test process.
function setup(gtag) {
  const listeners = new Map();
  const calls = [];
  const window = {
    location: { href: "https://genaimeetup.com/" },
    gtag: gtag === undefined ? (...args) => calls.push(args) : gtag,
  };
  const document = {
    addEventListener(type, listener) {
      assert.equal(listeners.has(type), false, `one ${type} handler`);
      listeners.set(type, listener);
    },
  };
  vm.runInNewContext(source, { window, document, URL });
  return {
    calls,
    window,
    dispatch(type, target, options = {}) {
      const event = { type, target, defaultPrevented: false, ...options };
      listeners.get(type)?.(event);
      assert.equal(event.defaultPrevented, options.defaultPrevented ?? false);
      return calls.at(-1);
    },
  };
}

function link(channel, href, location = "footer") {
  const node = { href, dataset: { channel, location } };
  node.closest = selector => selector === "a[data-channel]" ? node : null;
  return node;
}

function form(valid = true, contactType = "speaker", tracked = true) {
  return {
    matches: selector => tracked && selector === "form[data-track-contact]",
    checkValidity: () => valid,
    elements: {
      namedItem(name) {
        assert.equal(name, "contactType", "never read personal form fields");
        return { value: contactType };
      },
    },
    get action() { throw new Error("must not read the FormSubmit address"); },
  };
}

test("delegated clicks include dynamically inserted cards and nested targets", () => {
  const tracker = setup();
  const card = link("meetup", "https://www.meetup.com/gen-ai/events/316919852/?source=hero#details", "events");
  const title = { closest: () => card };
  tracker.dispatch("click", title, { button: 0 });
  const [command, name, params] = tracker.calls[0];
  assert.equal(command, "event");
  assert.equal(name, "meetup_click");
  assert.equal(params.channel, "meetup");
  assert.equal(params.page_section, "events");
  assert.equal(params.action_type, "event_rsvp");
  assert.equal(params.content_id, "316919852");
  assert.equal(params.link_url, "https://www.meetup.com/gen-ai/events/316919852/");
  assert.equal(params.destination, params.link_url);
  assert.equal(params.link_domain, "www.meetup.com");
  assert.equal(params.transport_type, "beacon");

  card.href = "https://www.meetup.com/gen-ai/events/316919853/";
  tracker.dispatch("click", title, { button: 0 });
  assert.equal(tracker.calls[1][2].content_id, "316919853", "read current destination on every click");
});

test("classifies Meetup calendar and community membership links", () => {
  const tracker = setup();
  tracker.dispatch("click", link("meetup", "https://www.meetup.com/gen-ai/events/"));
  assert.equal(tracker.calls[0][2].action_type, "calendar");
  tracker.dispatch("click", link("meetup", "https://www.meetup.com/gen-ai/"));
  assert.equal(tracker.calls[1][2].action_type, "group");
});

test("primary, keyboard, modified, and middle clicks count once each", () => {
  const tracker = setup();
  const node = link("youtube", "https://www.youtube.com/@GenAIPod");
  tracker.dispatch("click", node, { button: 0 });
  tracker.dispatch("click", node); // Keyboard activation.
  tracker.dispatch("click", node, { button: 0, ctrlKey: true });
  tracker.dispatch("click", node, { button: 1 });
  tracker.dispatch("auxclick", node, { button: 1 });
  tracker.dispatch("auxclick", node, { button: 0 });
  tracker.dispatch("click", node, { button: 2 });
  tracker.dispatch("auxclick", node, { button: 2 });
  assert.equal(tracker.calls.length, 4);
});

test("YouTube keeps only valid video IDs and classifies channel links", () => {
  const tracker = setup();
  tracker.dispatch("click", link("youtube", "https://www.youtube.com/watch?v=mt4qfLVVh9g&email=private@example.com#private", "hero-video"));
  const params = tracker.calls[0][2];
  assert.equal(params.action_type, "video");
  assert.equal(params.content_id, "mt4qfLVVh9g");
  assert.equal(params.link_url, "https://www.youtube.com/watch?v=mt4qfLVVh9g");
  tracker.dispatch("click", link("youtube", "https://www.youtube.com/@GenAIPod?token=private"));
  assert.equal(tracker.calls[1][2].action_type, "channel");
  assert.equal(tracker.calls[1][2].link_url, "https://www.youtube.com/@GenAIPod");
  tracker.dispatch("click", link("youtube", "https://www.youtube.com/watch?v=private%40example.com"));
  assert.equal(tracker.calls[2][2].content_id, undefined);
  assert.equal(tracker.calls[2][2].link_url, "https://www.youtube.com/");
  assert.doesNotMatch(JSON.stringify(tracker.calls), /private/);
});

test("podcast platforms remain distinct without claiming playback", () => {
  const tracker = setup();
  const cases = [
    ["https://open.spotify.com/show/17iOtOaooBbod2vGLvh7cS?si=private", "spotify"],
    ["https://podcasts.apple.com/us/podcast/the-generative-ai-meetup-podcast/id1727039579?private=yes", "apple"],
    ["https://podcast.genaimeetup.com/?private=yes", "archive"],
  ];
  for (const [url, platform] of cases) {
    const [, eventName, params] = tracker.dispatch("click", link("podcast", url));
    assert.equal(eventName, "podcast_click");
    assert.equal(params.podcast_platform, platform);
    assert.equal(params.action_type, "podcast_open");
    assert.doesNotMatch(params.link_url, /\?/);
  }
});

test("Substack distinguishes subscribe, article, and publication intent", () => {
  const tracker = setup();
  for (const [pathname, action] of [["/subscribe", "subscribe"], ["/p/personal-finance", "article"], ["/archive", "publication"], ["/", "publication"]]) {
    const [, name, params] = tracker.dispatch("click", link("substack", `https://genaipod.substack.com${pathname}?email=private%40example.com#private`));
    assert.equal(name, "substack_click");
    assert.equal(params.action_type, action);
    assert.equal(params.content_id, action === "article" ? "personal-finance" : undefined);
    assert.doesNotMatch(JSON.stringify(params), /private/);
  }
  tracker.dispatch("click", link("substack", `https://genaipod.substack.com/p/${"x".repeat(101)}`));
  assert.equal(tracker.calls.at(-1)[2].content_id, undefined, "content IDs must be bounded");
});

test("email clicks never contain addresses, subjects, or bodies", () => {
  const tracker = setup();
  const [, name, params] = tracker.dispatch("click", link("email", "mailto:private@example.com?subject=secret&body=personal", "contact"));
  assert.equal(name, "email_click");
  assert.equal(params.action_type, "contact_email");
  assert.equal(params.link_url, "mailto:");
  assert.equal(params.destination, "mailto:");
  assert.equal(params.link_domain, undefined);
  assert.doesNotMatch(JSON.stringify(params), /private|example|secret|personal/);
});

test("only valid contact submissions count, with an allowlisted contact type", () => {
  const tracker = setup();
  tracker.dispatch("submit", form(false));
  tracker.dispatch("submit", form(true, "private@example.com"));
  tracker.dispatch("submit", form(true, "speaker", false));
  tracker.dispatch("submit", form(), { defaultPrevented: true });
  tracker.dispatch("click", { closest: () => null }); // Submit button is not a conversion.
  assert.equal(tracker.calls.length, 0);
  for (const type of ["sponsor", "speaker", "other"]) {
    const [, name, params] = tracker.dispatch("submit", form(true, type));
    assert.equal(name, "contact_submit_attempt");
    assert.equal(params.contact_type, type);
    assert.deepEqual(Object.keys(params).sort(), ["action_type", "channel", "contact_type", "page_section", "transport_type"]);
  }
  assert.equal(tracker.calls.length, 3);
});

test("unknown channels, untrusted destinations, and prevented clicks are ignored", () => {
  const tracker = setup();
  for (const channel of ["unknown", "__proto__", "constructor", undefined]) {
    tracker.dispatch("click", link(channel, "https://www.meetup.com/gen-ai/"));
  }
  for (const href of ["javascript:alert(1)", "https://private:secret@www.meetup.com/gen-ai/", "https://unknown.example/gen-ai/"]) {
    tracker.dispatch("click", link("meetup", href));
  }
  tracker.dispatch("click", link("email", "https://www.meetup.com/gen-ai/"));
  tracker.dispatch("click", link("meetup", "https://www.meetup.com/gen-ai/"), { defaultPrevented: true });
  assert.equal(tracker.calls.length, 0);
  const [, name, params] = tracker.dispatch("click", link("discord", "https://discadia.com/gen-ai/?ref=private", "private@example.com"));
  assert.equal(name, "discord_click");
  assert.equal(params.page_section, "other");
  assert.equal(params.link_url, "https://discadia.com/gen-ai/");
});

test("missing or throwing analytics never interrupts links or valid form submissions", () => {
  for (const gtag of [null, () => { throw new Error("analytics unavailable"); }]) {
    const tracker = setup(gtag);
    assert.doesNotThrow(() => tracker.dispatch("click", link("meetup", "https://www.meetup.com/gen-ai/")));
    assert.doesNotThrow(() => tracker.dispatch("submit", form()));
  }
});

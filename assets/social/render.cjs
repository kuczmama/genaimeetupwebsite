// Run with a Node.js environment that provides Playwright and installed Chrome:
// node assets/social/render.cjs
// The source HTML uses the repository's existing local font files. No network.
const { chromium } = require("playwright");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

async function main() {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    for (const art of [
      { source: "share-source.html", output: "gen-ai-meetup-share.png", width: 1200, height: 630 },
      { source: "logo-source.html", output: "gen-ai-meetup-logo.png", width: 512, height: 512 },
    ]) {
      const page = await browser.newPage({ viewport: { width: art.width, height: art.height }, deviceScaleFactor: 1 });
      await page.goto(pathToFileURL(path.join(__dirname, art.source)).href);
      await page.evaluate(() => document.fonts.ready);
      const layout = await page.evaluate(() => ({
        width: document.documentElement.scrollWidth,
        height: document.documentElement.scrollHeight,
        fontReady: document.fonts.check('700 46px "DM Sans"'),
      }));
      if (layout.width !== art.width || layout.height !== art.height || !layout.fontReady) {
        throw new Error(`${art.source} has invalid layout or unloaded font: ${JSON.stringify(layout)}`);
      }
      await page.screenshot({ path: path.join(__dirname, art.output), type: "png", omitBackground: false });
      console.log(`${art.output}: ${art.width} × ${art.height}`);
      await page.close();
    }
  } finally {
    await browser.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });

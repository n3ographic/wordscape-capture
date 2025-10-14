export const config = { runtime: "nodejs" };

import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).send("POST only");
  const { url, term } = req.body || {};
  if (!url || !term) return res.status(400).send("Missing url or term");

  let browser = null;
  try {
    const executablePath = await chromium.executablePath();
    browser = await puppeteer.launch({
      args: chromium.args,
      executablePath,
      headless: chromium.headless,
      defaultViewport: { width: 1280, height: 720 }
    });

    const page = await browser.newPage();
    const resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 });
    if (!resp?.ok()) throw new Error(`Failed to load ${url} (${resp?.status()})`);

    await page.addStyleTag({ content: `mark{background:#ffeb3b;padding:.1em .2em;border-radius:.2em}
      .__ws_focus{outline:4px solid #ff9800;outline-offset:4px}` });

    await page.evaluate((needle) => {
      const norm = s => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
      const target = norm(needle);
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      const range = document.createRange();
      while (walker.nextNode()) {
        const node = walker.currentNode;
        const raw = node.nodeValue || "";
        const n = norm(raw);
        const idx = n.indexOf(target);
        if (idx >= 0) {
          range.setStart(node, idx);
          range.setEnd(node, idx + target.length);
          const mark = document.createElement("mark");
          range.surroundContents(mark);
          mark.classList.add("__ws_focus");
          mark.scrollIntoView({ block: "center", inline: "center" });
          break;
        }
      }
    }, term);

    await page.waitForTimeout(250);
    const buf = await page.screenshot({ type: "jpeg", quality: 80 });
    res.setHeader("Content-Type", "image/jpeg");
    res.send(buf);
  } catch (e) {
    res.status(500).send(e?.message || "Capture error");
  } finally {
    try { await browser?.close(); } catch {}
  }
}

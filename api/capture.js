// /api/capture.js
// POST { url, term } -> image/jpeg (surligne "term" et screenshot)

import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";

const allowCors = (req, res) => {
  const origin = req.headers.origin || "*";
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
};

export default async function handler(req, res) {
  allowCors(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST")   return res.status(405).send("POST only");

  const { url, term } = req.body || {};
  if (!url || !term) return res.status(400).send("Missing url or term");

  let browser;
  try {
    const executablePath = await chromium.executablePath();
    browser = await puppeteer.launch({
      args: chromium.args,
      executablePath,
      headless: chromium.headless,
      defaultViewport: { width: 1280, height: 720, deviceScaleFactor: 1 }
    });

    const page = await browser.newPage();
    const resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 25000 });
    if (!resp?.ok()) throw new Error(`Failed to load ${url} (status ${resp ? resp.status() : "?"})`);

    await page.addStyleTag({
      content: `mark.__ws{background:#ffeb3b;padding:.1em .25em;border-radius:.2em}
                .__ws_focus{outline:4px solid #ff9800;outline-offset:4px}`
    });

    // Surligner la 1re occurrence (sans accents / majuscules)
    await page.evaluate((needle) => {
      const norm = (s) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
      const target = norm(needle);
      const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      const r = document.createRange();
      while (w.nextNode()) {
        const n = w.currentNode;
        const t = n.nodeValue || "";
        const i = norm(t).indexOf(target);
        if (i >= 0) {
          r.setStart(n, i);
          r.setEnd(n, i + target.length);
          const m = document.createElement("mark");
          m.className = "__ws __ws_focus";
          r.surroundContents(m);
          m.scrollIntoView({ block: "center", inline: "center" });
          break;
        }
      }
    }, term);

    await page.waitForTimeout(250);

    const buf = await page.screenshot({ type: "jpeg", quality: 80 });
    res.setHeader("Content-Type", "image/jpeg");
    res.setHeader("Cache-Control", "no-store");
    res.send(buf);
  } catch (e) {
    res.status(500).send(String(e?.message || e));
  } finally {
    try { await browser?.close(); } catch {}
  }
}

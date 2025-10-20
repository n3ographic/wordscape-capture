const setCORS = (res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Max-Age", "600");
};

function fetchWithTimeout(url, options = {}, ms = 15000) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { ...options, signal: ctrl.signal }).finally(() => clearTimeout(id));
}

function htmlToText(html) {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const WORD_CHAR_RE = /[\p{L}\p{N}_]/u;
const isWordChar = (ch) => !!(ch && WORD_CHAR_RE.test(ch));

function hexToRgba(hex, a = 1) {
  let c = hex.replace("#", "").trim();
  if (c.length === 3) c = c.split("").map(x => x + x).join("");
  const n = parseInt(c, 16);
  return `rgba(${(n>>16)&255},${(n>>8)&255},${n&255},${a})`;
}
function buildStyles({ color = "#ffeb3b", outline = 6, glow = 24, scrollPad = 80 } = {}) {
  return `
    ::target-text{
      background:${color}!important;color:#111!important;border-radius:6px!important;
      padding:2px 4px!important;outline:none!important;
      box-shadow:0 0 0 ${outline}px ${hexToRgba(color,0.95)},
                 0 0 0 ${outline*2}px ${hexToRgba(color,0.35)},
                 0 0 ${glow}px ${hexToRgba("#ffc800",0.5)}!important;
      -webkit-box-decoration-break:clone;box-decoration-break:clone;
    }
    .vector-sticky-header,#mw-head,#siteNotice{display:none!important;}
    html{scroll-padding-top:${scrollPad}px!important;}
  `.replace(/\s+/g," ");
}

async function screenshotMicrolink(targetURL, {
  color = "#ffeb3b", outline = 6, glow = 24, viewportWidth = 1280, viewportHeight = 720, waitFor = 800
} = {}) {
  const u = new URL("https://api.microlink.io");
  u.searchParams.set("url", targetURL.toString());
  u.searchParams.set("screenshot", "true");
  u.searchParams.set("meta", "false");
  u.searchParams.set("viewport.width", String(viewportWidth));
  u.searchParams.set("viewport.height", String(viewportHeight));
  u.searchParams.set("waitForTimeout", String(waitFor));
  u.searchParams.set("styles", buildStyles({ color, outline, glow }));
  const r = await fetchWithTimeout(u.toString(), {}, 15000);
  if (!r.ok) throw new Error(`Microlink ${r.status}`);
  const j = await r.json();
  const url = j?.data?.screenshot?.url;
  if (!url) throw new Error("Microlink: no screenshot.url");
  return url;
}

export default async function handler(req, res) {
  setCORS(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "POST only" });

  try {
    const { url, term, max = 8, wholeWord = true, color, outline, glow, viewportWidth, viewportHeight, waitFor } = req.body || {};
    if (!url || !term) return res.status(400).json({ ok: false, error: "Missing url or term" });

    const page = await fetchWithTimeout(url, {}, 12000);
    if (!page.ok) return res.status(502).json({ ok: false, error: `Fetch failed: ${page.status}` });
    const text = htmlToText(await page.text());
    if (!text) return res.json({ ok: true, items: [], count: 0 });

    const lower = text.toLocaleLowerCase();
    const needle = String(term).toLocaleLowerCase();
    const cap = Math.max(1, Math.min(parseInt(max, 10) || 8, 20));

    const positions = [];
    let from = 0;
    while (positions.length < cap) {
      const i = lower.indexOf(needle, from);
      if (i === -1) break;
      const start = i, end = i + needle.length;
      if (wholeWord) {
        const before = text[start - 1] || "", after = text[end] || "";
        if (isWordChar(before) || isWordChar(after)) { from = i + needle.length; continue; }
      }
      positions.push({ start, end });
      from = i + needle.length;
    }

    if (!positions.length) return res.json({ ok: true, items: [], count: 0 });

    const ctx = 30;
    const items = [];
    for (const { start, end } of positions) {
      const before = text.slice(Math.max(0, start - ctx), start).trim();
      const match  = text.slice(start, end);
      const after  = text.slice(end, Math.min(text.length, end + ctx)).trim();
      const frag = `:~:text=${encodeURIComponent(before)}-,${encodeURIComponent(match)},-${encodeURIComponent(after)}`;
      const target = new URL(url); target.hash = frag;

      let imageUrl = "";
      try {
        imageUrl = await screenshotMicrolink(target, { color, outline, glow, viewportWidth, viewportHeight, waitFor });
      } catch {}
      const safe = target.toString().replace(/#/g, "%23");
      const fallbackUrl = `https://image.thum.io/get/width/1280/crop/720/noanimate/${safe}`;

      items.push({ imageUrl, fallbackUrl, target: target.toString(), fragment: frag, provider: imageUrl ? "microlink" : "thum.io" });
    }

    res.json({ ok: true, items, count: items.length });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}

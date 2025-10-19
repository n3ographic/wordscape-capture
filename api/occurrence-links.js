// POST { url, term, max?: number, wholeWord?: boolean } -> { ok, items:[{ imageUrl, target, fragment, provider }], count }
const CORS = (res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Max-Age", "600");
};

function fetchWithTimeout(url, options = {}, ms = 12000) {
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

function buildScreenshotURL(targetURL) {
  const key = process.env.SCREENSHOTONE_KEY;
  if (key) {
    const u = new URL("https://api.screenshotone.com/take");
    u.searchParams.set("access_key", key);
    u.searchParams.set("url", targetURL.toString());
    u.searchParams.set("format", "jpeg");
    u.searchParams.set("viewport_width", "1280");
    u.searchParams.set("viewport_height", "720");
    u.searchParams.set("block_ads", "true");
    u.searchParams.set("cache", "true");
    return { url: u.toString(), provider: "screenshotone" };
  }
  const safe = targetURL.toString().replace(/#/g, "%23");
  const thum = `https://image.thum.io/get/width/1280/crop/720/noanimate/${safe}`;
  return { url: thum, provider: "thum.io" };
}

export default async function handler(req, res) {
  CORS(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "POST only" });

  try {
    const { url, term, max = 5, wholeWord = true } = req.body || {};
    if (!url || !term) return res.status(400).json({ ok: false, error: "Missing url or term" });

    const page = await fetchWithTimeout(url, {}, 12000);
    if (!page.ok) return res.status(502).json({ ok: false, error: `Fetch failed: ${page.status}` });
    const html = await page.text();
    const text = htmlToText(html);
    if (!text) return res.json({ ok: true, items: [], count: 0 });

    const lower = text.toLocaleLowerCase();
    const needle = String(term).toLocaleLowerCase();
    const maxCount = Math.max(1, Math.min(max, 20));

    const positions = [];
    let from = 0;
    while (positions.length < maxCount) {
      const i = lower.indexOf(needle, from);
      if (i === -1) break;
      const start = i;
      const end = i + needle.length;

      if (wholeWord) {
        const before = text[start - 1] || "";
        const after  = text[end] || "";
        const ok = !isWordChar(before) && !isWordChar(after);
        if (!ok) { from = i + needle.length; continue; }
      }
      positions.push({ start, end });
      from = i + needle.length;
    }

    if (!positions.length) return res.json({ ok: true, items: [], count: 0 });

    const windowSize = 30;
    const items = positions.map(({ start, end }) => {
      const before = text.slice(Math.max(0, start - windowSize), start).trim();
      const match  = text.slice(start, end);
      const after  = text.slice(end, Math.min(text.length, end + windowSize)).trim();

      const prefixEnc = encodeURIComponent(before);
      const termEnc   = encodeURIComponent(match);
      const suffixEnc = encodeURIComponent(after);
      const frag = `:~:text=${prefixEnc}-,${termEnc},-${suffixEnc}`;

      const target = new URL(url);
      target.hash = frag;

      const { url: imageUrl, provider } = buildScreenshotURL(target);
      return { imageUrl, target: target.toString(), fragment: frag, provider };
    });

    res.json({ ok: true, items, count: items.length });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}

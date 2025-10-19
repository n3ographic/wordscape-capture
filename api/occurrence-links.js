// POST { url, term, max?: number, wholeWord?: boolean }
// -> { ok, items:[{ imageUrl, fallbackUrl, target, fragment, provider }], count }

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

async function screenshotMicrolink(targetURL) {
  // Appelle Microlink, récupère JSON, extrait l’URL image directe.
  const u = new URL("https://api.microlink.io");
  u.searchParams.set("url", targetURL.toString());     // contient #:~:text=...
  u.searchParams.set("screenshot", "true");
  u.searchParams.set("meta", "false");
  u.searchParams.set("viewport.width", "1280");
  u.searchParams.set("viewport.height", "720");
  u.searchParams.set("waitForTimeout", "800");
  u.searchParams.set(
    "styles",
    "::target-text{background:#ff0!important;color:#000!important;outline:6px solid rgba(255,215,0,.9)!important;}"
  );
  // Si jamais tu ajoutes MICROLINK_KEY plus tard, on l’enverra via proxy-image (pas ici).

  const r = await fetchWithTimeout(u.toString(), {}, 15000);
  if (!r.ok) throw new Error(`Microlink ${r.status}`);
  const j = await r.json();
  const url = j?.data?.screenshot?.url;
  if (!url) throw new Error("Microlink: no screenshot.url");
  return url; // URL d'image (hébergée par Microlink CDN)
}

export default async function handler(req, res) {
  CORS(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "POST only" });

  try {
    const { url, term, max = 8, wholeWord = true } = req.body || {};
    if (!url || !term) return res.status(400).json({ ok: false, error: "Missing url or term" });

    // 1) Récupère page & texte
    const page = await fetchWithTimeout(url, {}, 12000);
    if (!page.ok) return res.status(502).json({ ok: false, error: `Fetch failed: ${page.status}` });
    const html = await page.text();
    const text = htmlToText(html);
    if (!text) return res.json({ ok: true, items: [], count: 0 });

    // 2) Trouve toutes les occurrences (insensible à la casse + frontières de mot)
    const lower = text.toLocaleLowerCase();
    const needle = String(term).toLocaleLowerCase();
    const cap = Math.max(1, Math.min(parseInt(max, 10) || 8, 20));

    const positions = [];
    let from = 0;
    while (positions.length < cap) {
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

    // 3) Construit un fragment pour CHAQUE occurrence, screenshot Microlink + fallback thum.io
    const ctx = 30;
    const items = [];
    for (const { start, end } of positions) {
      const before = text.slice(Math.max(0, start - ctx), start).trim();
      const match  = text.slice(start, end);
      const after  = text.slice(end, Math.min(text.length, end + ctx)).trim();

      const frag = `:~:text=${encodeURIComponent(before)}-,${encodeURIComponent(match)},-${encodeURIComponent(after)}`;
      const target = new URL(url);
      target.hash = frag;

      // Microlink (image directe)
      let imageUrl = "";
      try {
        imageUrl = await screenshotMicrolink(target);
      } catch { /* on laissera le fallback s'appliquer côté client */ }

      // Fallback thum.io (au cas où Microlink rate/quota)
      const safe = target.toString().replace(/#/g, "%23");
      const fallbackUrl = `https://image.thum.io/get/width/1280/crop/720/noanimate/${safe}`;

      items.push({ imageUrl, fallbackUrl, target: target.toString(), fragment: frag, provider: imageUrl ? "microlink" : "thum.io" });
    }

    res.json({ ok: true, items, count: items.length });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}

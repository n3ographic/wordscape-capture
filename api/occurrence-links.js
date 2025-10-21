// api/occurrence-links.js
// Retourne jusqu’à N captures d’une page où "term" apparaît,
// en centrant et surlignant le mot (jaune) via Microlink,
// avec fallback thum.io. Répond correctement au préflight CORS.

import { withCORS } from "./_cors.js";

// ---------- utils ----------
const MICROLINK = "https://api.microlink.io/";
const VIEWPORT_W = 1280;
const VIEWPORT_H = 720;

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function cleanHtmlToText(html) {
  // retire scripts/styles, puis tags -> espaces, compacte
  html = html.replace(/<script[\s\S]*?<\/script>/gi, "");
  html = html.replace(/<style[\s\S]*?<\/style>/gi, "");
  const text = html
    .replace(/<[^>]+>/g, " ")
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text;
}
function getLastWords(str, n = 3) {
  const parts = str.trim().split(/\s+/);
  return parts.slice(Math.max(0, parts.length - n)).join(" ");
}
function getFirstWords(str, n = 3) {
  const parts = str.trim().split(/\s+/);
  return parts.slice(0, n).join(" ");
}
function makeTextFragment(before, target, after) {
  // :~:text=before-,target,-after
  const enc = encodeURIComponent;
  return `:~:text=${enc(before)}-,${enc(target)},-${enc(after)}`;
}
function buildHighlightCSS({
  bg = "#fff44b",
  radius = 6,
  glow = "0 0 0 6px rgba(255,244,75,.85)",
} = {}) {
  return `
    ::target-text{
      background:${bg}!important;
      box-shadow:${glow}!important;
      border-radius:${radius}px!important;
      color:inherit!important;
      text-shadow:none!important;
    }
  `;
}
function microlinkImageUrl(targetUrl, styles) {
  const u = new URL(MICROLINK);
  u.searchParams.set("url", targetUrl);
  u.searchParams.set("screenshot", "true");
  u.searchParams.set("meta", "false");
  u.searchParams.set("embed", "screenshot.url");
  u.searchParams.set("waitUntil", "networkidle2");
  u.searchParams.set("viewport.width", String(VIEWPORT_W));
  u.searchParams.set("viewport.height", String(VIEWPORT_H));
  // centre automatiquement la vue sur le pseudo ::target-text
  u.searchParams.set("scrollTo", ":target-text");
  u.searchParams.set("scrollBehavior", "center");
  if (styles) u.searchParams.set("styles", styles);
  // astuce : renvoi d'une image directe
  u.searchParams.set("as", "image");
  return u.toString();
}
function thumioFallback(targetUrl) {
  // crop/720 (hauteur) est tolérant par rapport aux fragments
  return `https://image.thum.io/get/width/${VIEWPORT_W}/crop/720/noanimate/${encodeURIComponent(
    targetUrl
  )}`;
}

// ---------- main handler ----------
async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "Use POST" });
    return;
  }

  let body = {};
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
  } catch (_) {}

  const {
    url,
    term,
    max = 6,
    radius = 6,
    bg = "#fff44b",
    glow = "0 0 0 6px rgba(255,244,75,.85)",
  } = body || {};

  if (!url || !term) {
    res.status(400).json({ ok: false, error: "Missing url or term" });
    return;
  }

  // récupère la page
  let html;
  try {
    const r = await fetch(url, { redirect: "follow" });
    if (!r.ok) throw new Error(String(r.status));
    html = await r.text();
  } catch (err) {
    res.status(502).json({ ok: false, error: "fetch_failed", detail: String(err) });
    return;
  }

  const text = cleanHtmlToText(html);
  const rx = new RegExp(escapeRegex(term), "giu");

  const found = [];
  let m;
  while ((m = rx.exec(text)) && found.length < Number(max || 6)) {
    const i = m.index;
    const L = m[0].length;

    // un peu de contexte autour de l’occurrence
    const beforeContext = text.slice(Math.max(0, i - 160), i);
    const afterContext = text.slice(i + L, i + L + 160);

    const before = getLastWords(beforeContext, 4);
    const after = getFirstWords(afterContext, 4);

    const fragment = makeTextFragment(before, m[0], after);
    const targetUrl = `${url}#${fragment}`;

    const styles = buildHighlightCSS({ bg, radius, glow });
    const imageUrl = microlinkImageUrl(targetUrl, styles);
    const fallbackUrl = thumioFallback(targetUrl);

    found.push({
      index: found.length + 1,
      before,
      target: m[0],
      after,
      url: targetUrl,
      imageUrl, // à utiliser via /api/proxy-image?src={encodeURIComponent(imageUrl)}
      fallbackUrl,
      fragment,
      provider: "microlink",
    });
  }

  res.status(200).json({
    ok: true,
    count: found.length,
    term,
    url,
    items: found,
  });
}

export default withCORS(handler);

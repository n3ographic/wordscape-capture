// /api/occurrence-links.js
import { withCors } from "./_cors.js";

// Style injecté DANS la capture (Microlink)
const HIGHLIGHT_CSS = `
  ::target-text{
    background:#fff44b !important;
    box-shadow:0 0 0 6px rgba(255,244,75,.85) !important;
    border-radius:6px !important;
    color:inherit !important;
    text-shadow:none !important;
  }
`;

// UA gentille pour éviter des 403
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";

const norm = (s) => (s || "").normalize("NFC");

// on nettoie l'HTML → texte plat (suffisant pour construire les contextes)
function htmlToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// encode “friendly” pour text-fragments
const encFrag = (s) =>
  encodeURIComponent(
    (s || "").replace(/\s+/g, " ").replace(/[,#?]/g, " ").slice(0, 80)
  );

// text-fragment pour CETTE occurrence : prefix-,mot,-suffix
function makeFragment(plain, index, len, ctx = 28) {
  const start = Math.max(0, index - ctx);
  const end = Math.min(plain.length, index + len + ctx);
  const before = plain.slice(start, index).trim();
  const target = plain.slice(index, index + len);
  const after = plain.slice(index + len, end).trim();
  return `:~:text=${encFrag(before)}-,${encFrag(target)},-${encFrag(after)}`;
}

function buildMicrolink(urlWithFragment, { vw, vh, scale }) {
  const qs = new URLSearchParams({
    url: urlWithFragment,
    screenshot: "true",
    meta: "false",
    embed: "screenshot.url",
    waitUntil: "networkidle2",
    "viewport.width": String(vw),
    "viewport.height": String(vh),
    "viewport.deviceScaleFactor": String(scale),
    scrollTo: ":target-text",
    scrollBehavior: "center",
    styles: HIGHLIGHT_CSS,
    as: "image",
  });
  return `https://api.microlink.io/?${qs.toString()}`;
}

export default withCors(async function handler(req, res) {
  try {
    if (req.method === "OPTIONS") return res.status(204).end();
    if (req.method !== "POST")
      return res.status(405).json({ ok: false, error: "Use POST" });

    const body =
      typeof req.body === "object" ? req.body : JSON.parse(req.body || "{}");

    const pageUrl = String(body.url || "").trim();
    const term0 = String(body.term || "").trim();
    const max = Math.min(Number(body.max || 6) || 6, 20);

    // paramètres “zoom”
    const vw = Math.max(200, Number(body.vw || 720));
    const vh = Math.max(200, Number(body.vh || 360));
    const scale = Math.min(3, Math.max(1, Number(body.scale || 2)));

    if (!pageUrl || !term0)
      return res
        .status(400)
        .json({ ok: false, error: "Missing `url` or `term`" });

    const u = new URL(pageUrl);
    const normalized = u.toString();
    const term = norm(term0);

    // 1) on récupère la page
    const r = await fetch(normalized, {
      headers: { "user-agent": UA, "accept-language": "fr,en;q=0.9" },
    });
    if (!r.ok)
      return res.status(200).json({ ok: false, error: `Fetch ${r.status}` });
    const html = await r.text();
    const plain = norm(htmlToText(html));

    // 2) on trouve TOUTES les occurrences (unicode + insensitive)
    const safe = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(safe, "giu");
    const matches = [];
    let m;
    while ((m = re.exec(plain)) && matches.length < max) {
      matches.push({ index: m.index, len: m[0].length });
    }

    // 3) fallback si rien trouvé
    const list = matches.length
      ? matches
      : [{ index: Math.max(0, plain.toLowerCase().indexOf(term.toLowerCase())), len: term.length }];

    // 4) un text-fragment UNIQUE par occurrence
    const items = list.map((pos, i) => {
      const fragment = makeFragment(plain, pos.index, pos.len, 28);
      const urlWithFragment = `${normalized}#${fragment}`;
      return {
        index: i + 1,
        url: urlWithFragment,
        term,
        fragment,
        imageUrl: buildMicrolink(urlWithFragment, { vw, vh, scale }),
        fallbackUrl: `https://image.thum.io/get/width/${vw}/crop/${vh}/noanimate/${encodeURIComponent(
          urlWithFragment
        )}`,
        provider: "microlink",
      };
    });

    return res
      .status(200)
      .json({ ok: true, count: items.length, term, url: normalized, items });
  } catch (err) {
    return res
      .status(200)
      .json({ ok: false, error: String(err && err.message ? err.message : err) });
  }
});

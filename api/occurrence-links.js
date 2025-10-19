// /api/occurrence-links.js
// POST { url, term, max?: number, wholeWord?: boolean }
// -> { ok, items:[{ imageUrl, target, fragment, provider }], count }

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

// HTML -> texte visible (grossièrement)
function htmlToText(html) {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// “caractère de mot” (Lettre/Chiffre/_ ; Unicode)
const WORD_CHAR_RE = /[\p{L}\p{N}_]/u;
const isWordChar = (ch) => !!(ch && WORD_CHAR_RE.test(ch));

// --- Microlink pour les occurrences (scroll to text fragment + CSS jaune) ---
function buildMicrolinkURL(targetURL) {
  const u = new URL("https://api.microlink.io");
  u.searchParams.set("url", targetURL.toString());   // contient #:~:text=...
  u.searchParams.set("screenshot", "true");
  u.searchParams.set("embed", "screenshot.url");     // on veut directement l’URL de l’image
  // viewport 1280x720
  u.searchParams.set("viewport.width", "1280");
  u.searchParams.set("viewport.height", "720");
  // petite pause pour laisser le highlight/scroll se poser
  u.searchParams.set("waitForTimeout", "800");
  // vrai surlignage jaune du navigateur via ::target-text
  u.searchParams.set(
    "styles",
    "::target-text{background:#ff0!important;color:#000!important;outline:6px solid rgba(255,215,0,.9)!important;}"
  );
  // tu peux ajouter 'adblock=true' si besoin
  return { url: u.toString(), provider: "microlink" };
}

// fallback thum.io si jamais tu retires Microlink plus tard
function buildThumURL(targetURL) {
  const safe = targetURL.toString().replace(/#/g, "%23");
  return { url: `https://image.thum.io/get/width/1280/crop/720/noanimate/${safe}`, provider: "thum.io" };
}

export default async function handler(req, res) {
  CORS(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "POST only" });

  try {
    const { url, term, max = 8, wholeWord = true } = req.body || {};
    if (!url || !term) return res.status(400).json({ ok: false, error: "Missing url or term" });

    // 1) Récupère la page et extrait un texte
    const page = await fetchWithTimeout(url, {}, 12000);
    if (!page.ok) return res.status(502).json({ ok: false, error: `Fetch failed: ${page.status}` });
    const html = await page.text();
    const text = htmlToText(html);
    if (!text) return res.json({ ok: true, items: [], count: 0 });

    // 2) Trouve toutes les occurrences (insensible à la casse + frontière de mot)
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
        const okBoundary = !isWordChar(before) && !isWordChar(after);
        if (!okBoundary) { from = i + needle.length; continue; }
      }

      positions.push({ start, end });
      from = i + needle.length;
    }

    if (!positions.length) return res.json({ ok: true, items: [], count: 0 });

    // 3) Construit un fragment :~:text=prefix-,mot,-suffix pour CHAQUE occurrence
    const ctx = 30; // nb de caractères de contexte
    const items = positions.map(({ start, end }) => {
      const before = text.slice(Math.max(0, start - ctx), start).trim();
      const match  = text.slice(start, end);
      const after  = text.slice(end, Math.min(text.length, end + ctx)).trim();

      const frag = `:~:text=${encodeURIComponent(before)}-,${encodeURIComponent(match)},-${encodeURIComponent(after)}`;
      const target = new URL(url);
      target.hash = frag;

      // Microlink si on a la clé (ajoutée par le proxy en header), sinon thum.io
      const { url: imageUrl, provider } = buildMicrolinkURL(target);
      return { imageUrl, target: target.toString(), fragment: frag, provider };
    });

    res.json({ ok: true, items, count: items.length });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}

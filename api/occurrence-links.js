// /api/occurrence-links.js
// POST { url, term, max?: number } -> { ok, items: [{ imageUrl, target, fragment, provider }], count }
// - Récupère le HTML
// - Trouve toutes les occurrences (max N)
// - Pour chaque occurrence, fabrique un text fragment avec prefix/suffix
// - Génére un lien screenshot par occurrence (aucun rendu côté serveur)

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

// Simplifie le HTML -> texte visible approximatif
function htmlToText(html) {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// échappe une string pour RegExp
function escRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// construit l'URL d'image SANS fetch serveur
function buildScreenshotURL(targetURL) {
  const key = process.env.SCREENSHOTONE_KEY; // optionnel (provider premium)
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
  // ne pas encoder toute l'URL ; on protège juste '#'
  const safe = targetURL.toString().replace(/#/g, "%23");
  // thum.io : 'crop' = hauteur (px). Ici 720 → focus “plein écran”
  const thum = `https://image.thum.io/get/width/1280/crop/720/noanimate/${safe}`;
  return { url: thum, provider: "thum.io" };
}

export default async function handler(req, res) {
  CORS(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "POST only" });

  try {
    const { url, term, max = 5 } = req.body || {};
    if (!url || !term) return res.status(400).json({ ok: false, error: "Missing url or term" });

    // 1) récupère HTML
    const page = await fetchWithTimeout(url, {}, 12000);
    if (!page.ok) return res.status(502).json({ ok: false, error: `Fetch failed: ${page.status}` });
    const html = await page.text();
    const text = htmlToText(html);
    if (!text) return res.json({ ok: true, items: [], count: 0 });

    // 2) trouve occurrences (case-insensitive)
    const re = new RegExp(escRe(term), "gi");
    const occurrences = [];
    let m;
    while ((m = re.exec(text)) && occurrences.length < Math.max(1, Math.min(max, 20))) {
      occurrences.push({ index: m.index, match: m[0] });
      // évite les matches qui se chevauchent
      if (!re.global) break;
    }
    if (!occurrences.length) return res.json({ ok: true, items: [], count: 0 });

    // 3) fabrique un fragment textuel pour chaque occurrence
    const items = occurrences.map(({ index, match }) => {
      const windowSize = 30; // nb de caractères de contexte
      const start = Math.max(0, index - windowSize);
      const end = Math.min(text.length, index + match.length + windowSize);
      const before = text.slice(start, index).trim();
      const after = text.slice(index + match.length, end).trim();

      // Chrome Text Fragment: text=[prefix-,]textStart[,textEnd][,-suffix]
      // On encode les morceaux, pas les séparateurs
      const prefixEnc = encodeURIComponent(before);
      const termEnc = encodeURIComponent(match);
      const suffixEnc = encodeURIComponent(after);

      const frag = `:~:text=${prefixEnc}-,${termEnc},-${suffixEnc}`;

      const target = new URL(url);
      target.hash = frag;

      const { url: imageUrl, provider } = buildScreenshotURL(target);
      return { imageUrl, target: target.toString(), fragment: frag, provider };
    });

    return res.json({ ok: true, items, count: items.length });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}

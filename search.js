// /api/search.js
// Retourne une liste d'URLs trouvées pour une requête donnée via Google CSE
// Requêtes: /api/search?q=mot+clé&num=8&lang=fr&site=fr.wikipedia.org
export default async function handler(req, res) {
  try {
    const { q, num = "8", lang = "fr", site } = req.query || {};
    if (!q) return res.status(400).json({ error: "Missing q" });

    const key = process.env.GOOGLE_CSE_KEY;
    const cx  = process.env.GOOGLE_CSE_CX;
    if (!key || !cx) {
      return res.status(500).json({ error: "Missing GOOGLE_CSE_KEY or GOOGLE_CSE_CX" });
    }

    const limit = Math.min(parseInt(num, 10) || 8, 10); // CSE max 10 / requête
    const params = new URLSearchParams({
      key,
      cx,
      q: q,
      num: String(limit),
      safe: "active",   // un peu de filtrage
      lr: lang ? `lang_${lang}` : "", // lang_XX (optionnel)
      hl: lang || "fr",
    });

    // Filtre de site optionnel
    if (site) params.set("q", `${q} site:${site}`);

    const apiUrl = `https://www.googleapis.com/customsearch/v1?${params.toString()}`;
    const r = await fetch(apiUrl);
    const j = await r.json();

    if (!r.ok) {
      return res.status(r.status).json({ error: j.error?.message || "CSE error", details: j });
    }

    const urls = (j.items || [])
      .map(it => it.link)
      .filter(Boolean);

    return res.json({ q, count: urls.length, urls });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
}

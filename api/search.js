// /api/search.js
const allowCors = (req, res) => {
  const origin = req.headers.origin || "*";
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
};

export default async function handler(req, res) {
  allowCors(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();

  try {
    const { q, num = "8", lang = "fr", site } = req.query || {};
    if (!q) return res.status(400).json({ error: "Missing q" });

    const key = process.env.GOOGLE_CSE_KEY;
    const cx  = process.env.GOOGLE_CSE_CX;
    if (!key || !cx) return res.status(500).json({ error: "Missing GOOGLE_CSE_KEY or GOOGLE_CSE_CX" });

    const limit = Math.min(parseInt(num, 10) || 8, 10); // CSE max 10/rqt
    const p = new URLSearchParams({
      key, cx, q, num: String(limit),
      safe: "active", lr: `lang_${lang}`, hl: lang
    });
    if (site) p.set("q", `${q} site:${site}`);

    const r = await fetch(`https://www.googleapis.com/customsearch/v1?${p}`);
    const j = await r.json();
    if (!r.ok) return res.status(r.status).json({ error: j.error?.message || "CSE error", details: j });

    const urls = (j.items || []).map(i => i.link).filter(Boolean);
    res.json({ q, count: urls.length, urls });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
}

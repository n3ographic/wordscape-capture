// /api/search.js
const cors = (res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Max-Age", "600");
};

export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return res.status(405).json({ error: "GET only" });

  try {
    const { q, num = "8", lang = "fr", site } = req.query || {};
    if (!q) return res.status(400).json({ error: "Missing q" });

    const key = process.env.GOOGLE_CSE_KEY;
    const cx  = process.env.GOOGLE_CSE_CX;
    if (!key || !cx) return res.status(500).json({ error: "Missing GOOGLE_CSE_KEY or GOOGLE_CSE_CX" });

    const limit = Math.min(Math.max(parseInt(num, 10) || 8, 1), 10);

    const p = new URLSearchParams({
      key, cx, q, num: String(limit),
      safe: "active", lr: `lang_${lang}`, hl: lang
    });

    if (site) {
      const cleaned = String(site).trim().replace(/^https?:\/\//i, "").replace(/\/.*$/, "");
      if (cleaned) p.set("q", `${q} site:${cleaned}`);
    }

    const r = await fetch(`https://www.googleapis.com/customsearch/v1?${p.toString()}`);
    const text = await r.text();
    let j; try { j = JSON.parse(text); } catch { j = { raw: text }; }

    if (!r.ok) return res.status(r.status).json({ error: j?.error?.message || text.slice(0, 200) });

    const urls = (j.items || []).map(it => it.link).filter(Boolean);
    return res.json({ q, count: urls.length, urls });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
}

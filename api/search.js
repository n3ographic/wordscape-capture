import { setCORS, okOptions } from "./_cors.js";

export default async function handler(req, res) {
  if (okOptions(req, res)) return;
  setCORS(res);

  if (req.method !== "GET")
    return res.status(405).json({ ok: false, error: "GET only" });

  const {
    q,
    num = "5",
    lang = "fr",
    site // ex: fr.wikipedia.org
  } = req.query;

  if (!q) return res.status(400).json({ ok: false, error: "Missing q" });

  const key = process.env.GOOGLE_CSE_KEY;
  const cx  = process.env.GOOGLE_CSE_ID;
  if (!key || !cx) return res.status(500).json({ ok: false, error: "CSE not configured" });

  const params = new URLSearchParams({
    key, cx, q, num: String(num), lr: `lang_${lang}`
  });
  if (site) params.set("siteSearch", site);

  const url = `https://www.googleapis.com/customsearch/v1?${params}`;
  const r = await fetch(url);
  if (!r.ok) return res.status(r.status).json({ ok: false, error: await r.text() });
  const json = await r.json();

  const urls = (json.items || []).map(i => i.link);
  return res.status(200).json({ ok: true, q, count: urls.length, urls });
}

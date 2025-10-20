const CORS = (res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Vary", "Origin");
};

const cleanSite = (v = "") => v.replace(/^https?:\/\//, "").replace(/\/.*$/, "");

async function searchWikipedia({ q, num, lang }) {
  const langSafe = (lang || "fr").toLowerCase();
  const u = new URL(`https://${langSafe}.wikipedia.org/w/api.php`);
  u.searchParams.set("action", "query");
  u.searchParams.set("list", "search");
  u.searchParams.set("format", "json");
  u.searchParams.set("utf8", "1");
  u.searchParams.set("srlimit", String(num));
  u.searchParams.set("srsearch", q);
  u.searchParams.set("srwhat", "text");
  u.searchParams.set("origin", "*");
  const r = await fetch(u.toString());
  if (!r.ok) throw new Error(`Wikipedia ${r.status}`);
  const j = await r.json();
  const titles = (j?.query?.search || []).map((s) => s.title).filter(Boolean);
  const urls = titles.map((t) => `https://${langSafe}.wikipedia.org/wiki/${encodeURIComponent(t.replace(/ /g, "_"))}`);
  return { provider: "wikipedia", urls };
}

async function searchGoogleCSE({ q, num, lang, site }) {
  const key = process.env.GOOGLE_API_KEY;
  const cx  = process.env.GOOGLE_CSE_ID;
  if (!key || !cx) throw new Error("Missing GOOGLE_API_KEY/CSE_ID");
  const u = new URL("https://www.googleapis.com/customsearch/v1");
  const terms = [q];
  if (site) terms.push(`site:${site}`);
  u.searchParams.set("key", key);
  u.searchParams.set("cx", cx);
  u.searchParams.set("q", terms.join(" "));
  u.searchParams.set("num", String(num));
  u.searchParams.set("safe", "off");
  u.searchParams.set("lr", `lang_${(lang || "fr").toLowerCase()}`);
  u.searchParams.set("fields", "items(link)");
  const r = await fetch(u.toString());
  if (!r.ok) throw new Error(await r.text());
  const j = await r.json();
  const urls = (j.items || []).map((it) => it.link).filter(Boolean);
  return { provider: "google", urls };
}

export default async function handler(req, res) {
  CORS(res);
  if (req.method !== "GET") return res.status(405).json({ ok: false, error: "GET only" });

  const qRaw = String(req.query.q || "").trim();
  const q = qRaw;
  const lang = String(req.query.lang || "fr");
  const num = Math.max(1, Math.min(parseInt(req.query.num || "5", 10) || 5, 10));
  const site = cleanSite(String(req.query.site || ""));
  if (!q) return res.status(400).json({ ok: false, error: "Missing q" });

  const isWiki = /(^|\.)wikipedia\.org$/i.test(site);
  try {
    if (isWiki) {
      const { provider, urls } = await searchWikipedia({ q, num, lang });
      return res.status(200).json({ ok: true, provider, q, count: urls.length, urls });
    }
    const { provider, urls } = await searchGoogleCSE({ q, num, lang, site });
    return res.status(200).json({ ok: true, provider, q, count: urls.length, urls });
  } catch (e) {
    if (isWiki) {
      try {
        const { provider, urls } = await searchWikipedia({ q, num, lang });
        return res.status(200).json({ ok: true, provider: `${provider}-fallback`, q, count: urls.length, urls });
      } catch (ee) {
        return res.status(502).json({ ok: false, error: String(ee?.message || ee) });
      }
    }
    return res.status(429).json({ ok: false, error: String(e?.message || e) });
  }
}

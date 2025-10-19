// api/search.js
// - Si "site" = *.wikipedia.org  -> utilise l'API Wikipédia (gratuite, sans clé)
// - Sinon -> Google CSE (si dispo). En cas d'erreur/quota et site=wiki, on fallback sur Wikipédia.

const CORS = (res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Vary", "Origin");
};

function cleanSite(v = "") {
  return v.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
}

async function searchWikipedia({ q, num, lang }) {
  const langSafe = (lang || "en").toLowerCase();
  const u = new URL(`https://${langSafe}.wikipedia.org/w/api.php`);
  u.searchParams.set("action", "query");
  u.searchParams.set("list", "search");
  u.searchParams.set("format", "json");
  u.searchParams.set("utf8", "1");
  u.searchParams.set("srlimit", String(num));
  u.searchParams.set("srsearch", q);
  u.searchParams.set("srwhat", "text");
  // CORS côté navigateur
  u.searchParams.set("origin", "*");

  const r = await fetch(u.toString());
  if (!r.ok) throw new Error(`Wikipedia ${r.status}`);
  const j = await r.json();

  const titles = (j?.query?.search || []).map((s) => s.title).filter(Boolean);
  const urls = titles.map((t) => {
    const slug = encodeURIComponent(t.replace(/ /g, "_"));
    return `https://${langSafe}.wikipedia.org/wiki/${slug}`;
  });

  return { provider: "wikipedia", urls };
}

async function searchGoogleCSE({ q, num, lang, site }) {
  const key = process.env.GOOGLE_CSE_KEY;
  const cx  = process.env.GOOGLE_CSE_CX;
  if (!key || !cx) throw new Error("Missing GOOGLE_CSE_KEY/CX");

  const terms = [q];
  if (site) terms.push(`site:${site}`);

  const u = new URL("https://www.googleapis.com/customsearch/v1");
  u.searchParams.set("key", key);
  u.searchParams.set("cx", cx);
  u.searchParams.set("q", terms.join(" "));
  u.searchParams.set("num", String(num));
  u.searchParams.set("safe", "off");
  u.searchParams.set("lr", `lang_${(lang || "fr").toLowerCase()}`);
  u.searchParams.set("fields", "items(link)");

  const r = await fetch(u.toString());
  if (!r.ok) {
    const errText = await r.text().catch(() => "");
    throw new Error(errText || `CSE ${r.status}`);
  }
  const j = await r.json();
  const urls = (j.items || []).map((it) => it.link).filter(Boolean);
  return { provider: "google", urls };
}

export default async function handler(req, res) {
  CORS(res);
  if (req.method !== "GET") return res.status(405).json({ ok: false, error: "GET only" });

  const qRaw   = String(req.query.q || "").trim();
  const q      = qRaw;
  const lang   = String(req.query.lang || "fr");
  const num    = Math.max(1, Math.min(parseInt(req.query.num || "5", 10) || 5, 10));
  const site   = cleanSite(String(req.query.site || ""));

  if (!q) return res.status(400).json({ ok: false, error: "Missing q" });

  const isWiki = /(^|\.)wikipedia\.org$/i.test(site);

  try {
    // 1) Si Wikipedia demandé explicitement → on passe direct par l’API Wikipédia (gratuit)
    if (isWiki) {
      const { provider, urls } = await searchWikipedia({ q, num, lang });
      return res.status(200).json({ ok: true, provider, q, count: urls.length, urls });
    }

    // 2) Sinon, tente Google CSE
    const { provider, urls } = await searchGoogleCSE({ q, num, lang, site });
    return res.status(200).json({ ok: true, provider, q, count: urls.length, urls });
  } catch (e) {
    // 3) Fallback : si l’utilisateur filtrait sur Wikipédia et qu’on est ici à cause du quota Google,
    // on bascule automatiquement sur l’API Wikipédia.
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

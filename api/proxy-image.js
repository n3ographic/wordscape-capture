// /api/proxy-image.js
// Proxie des images sans double-encodage et avec cache.
// Autorise par défaut api.microlink.io et image.thum.io.
// Met PROXY_ALLOW_ANY=1 pour autoriser tous les hôtes (moins sûr).

const ALLOW_ANY = process.env.PROXY_ALLOW_ANY === "1";
const ALLOWLIST = [
  "api.microlink.io",
  "image.thum.io",
  // ajoute tes domaines si besoin
];

function multiDecode(input) {
  let out = String(input || "");
  // Décode 0..3 fois pour récupérer une URL double/triple-encodée (%2520 etc.)
  for (let i = 0; i < 3; i++) {
    try {
      const dec = decodeURIComponent(out);
      if (dec === out) break;
      out = dec;
    } catch {
      break;
    }
  }
  return out.trim();
}

function isAllowed(u) {
  if (ALLOW_ANY) return true;
  const host = u.hostname.toLowerCase();
  return ALLOWLIST.some((h) => host === h || host.endsWith("." + h));
}

export default async function handler(req, res) {
  // CORS basique + preflight
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,HEAD,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Max-Age", "600");

  if (req.method === "OPTIONS") return res.status(204).end();

  try {
    const raw = (req.query.src || req.query.url || "").toString();
    if (!raw) return res.status(400).send("Missing src");

    const decoded = multiDecode(raw);
    const url = new URL(decoded);

    if (!/^https?:$/.test(url.protocol)) return res.status(400).send("Only http/https");
    if (!isAllowed(url)) return res.status(403).send("Host not allowed");

    // Mode redirection rapide ? /api/proxy-image?src=...&redirect=1
    if (req.query.redirect === "1") {
      res.setHeader("Cache-Control", "public, s-maxage=86400, stale-while-revalidate=600");
      return res.redirect(302, url.toString());
    }

    // Sinon on stream l'image
    const upstream = await fetch(url.toString(), {
      redirect: "follow",
      // pas de Referer pour éviter certains hotlinks
      headers: { "User-Agent": "WordscapeProxy/1.0 (+vercel)" },
    });

    if (!upstream.ok) {
      return res.status(upstream.status).send(`Upstream error ${upstream.status}`);
    }

    res.setHeader("Cache-Control", "public, s-maxage=86400, stale-while-revalidate=600");

    const ct = upstream.headers.get("content-type");
    if (ct) res.setHeader("Content-Type", ct);
    const cd = upstream.headers.get("content-disposition");
    if (cd) res.setHeader("Content-Disposition", cd);

    const buf = Buffer.from(await upstream.arrayBuffer());
    return res.status(200).send(buf);
  } catch (err) {
    return res.status(400).send("Bad Request");
  }
}

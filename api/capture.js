// /api/capture.js
// POST { url, term } -> image/jpeg
// Capture via Microlink + surlignage avec #:~:text=<term>
// -> On met un timeout court pour ne JAMAIS laisser Vercel timeouter (ce qui casse CORS).

const CORS = (res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Max-Age", "600");
};

// petite aide pour imposer un timeout à fetch
async function fetchWithTimeout(url, options = {}, ms = 8000) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...options, signal: ctrl.signal });
  } finally {
    clearTimeout(id);
  }
}

export default async function handler(req, res) {
  CORS(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST")   return res.status(405).send("POST only");

  try {
    const { url, term } = req.body || {};
    if (!url || !term) return res.status(400).send("Missing url or term");

    // 1) Construire l’URL cible avec highlight (Scroll-To-Text)
    const cleanTerm = String(term).trim().replace(/\s+/g, " ");
    const target = new URL(url);
    target.hash = `:~:text=${encodeURIComponent(cleanTerm)}`;

    // 2) Appel Microlink (timeout court pour ne pas dépasser la limite Vercel)
    const api = new URL("https://api.microlink.io/");
    api.searchParams.set("url", target.toString());
    api.searchParams.set("screenshot", "true");
    api.searchParams.set("meta", "false");
    api.searchParams.set("screenshot.type", "jpeg");
    api.searchParams.set("screenshot.device", "desktop");
    api.searchParams.set("screenshot.viewport.width", "1280");
    api.searchParams.set("screenshot.viewport.height", "720");
    api.searchParams.set("waitForTimeout", "600"); // petit délai pour que le surlignage apparaisse

    let r;
    try {
      r = await fetchWithTimeout(api, {}, 8000); // 8s max
    } catch (e) {
      // on répond proprement (avec CORS) avant le timeout Vercel
      return res.status(504).send("Upstream screenshot service timed out.");
    }

    const j = await r.json().catch(() => null);
    const imgUrl = j?.data?.screenshot?.url;
    if (!r.ok || !imgUrl) {
      return res
        .status(502)
        .send(j?.error?.message || "Failed to capture screenshot.");
    }

    // 3) Récupérer l’image (timeout court) et renvoyer le binaire
    let imgRes;
    try {
      imgRes = await fetchWithTimeout(imgUrl, {}, 8000); // 8s max aussi
    } catch (e) {
      return res.status(504).send("Upstream image fetch timed out.");
    }
    if (!imgRes.ok) return res.status(502).send("Upstream image fetch failed.");

    const buf = Buffer.from(await imgRes.arrayBuffer());
    res.setHeader("Content-Type", "image/jpeg");
    res.setHeader("Cache-Control", "no-store");
    return res.send(buf);
  } catch (e) {
    // Toujours répondre avec nos headers → pas d’erreur CORS côté client
    return res.status(500).send(String(e?.message || e));
  }
}

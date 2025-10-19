// /api/capture-link.js
import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;
const TABLE = process.env.LINKS_TABLE || "capture_links";

// CORS pour Framer / navigateur
const cors = (res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Max-Age", "600");
};

// Construit une URL de screenshot SANS faire de fetch côté serveur
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

  // IMPORTANT : ne pas encoder toute l'URL (sinon double-encodage).
  // On remplace juste le '#' pour conserver :~:text
  const safe = targetURL.toString().replace(/#/g, "%23");
  const thum = `https://image.thum.io/get/width/1280/crop/1280x720/noanimate/${safe}`;
  return { url: thum, provider: "thum.io" };
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();

  // Petit ping pratique : GET /api/capture-link → 200
  if (req.method === "GET") {
    return res.status(200).json({ ok: true, route: "capture-link", tip: "Use POST { url, term }" });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "POST only" });
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
    return res
      .status(500)
      .json({ ok: false, error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE" });
  }

  try {
    const { url, term } = req.body || {};
    if (!url || !term) return res.status(400).json({ ok: false, error: "Missing url or term" });

    const cleanTerm = String(term).trim().replace(/\s+/g, " ");
    const target = new URL(url);
    // Scroll-To-Text highlight
    target.hash = `:~:text=${encodeURIComponent(cleanTerm)}`;

    // Clé de cache déterministe (url + terme)
    const urlHash = crypto.createHash("md5").update(`${url}::${cleanTerm}`).digest("hex");

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);

    // 1) Lookup cache
    const { data: row } = await supabase
      .from(TABLE)
      .select("image_url")
      .eq("url_hash", urlHash)
      .maybeSingle();

    if (row?.image_url) {
      return res.json({ ok: true, imageUrl: row.image_url, provider: "cache", cached: true });
    }

    // 2) Génère le lien (aucun fetch serveur)
    const { url: imageUrl, provider } = buildScreenshotURL(target);

    // 3) Stocke le lien
    const { error: upErr } = await supabase.from(TABLE).upsert({
      url_hash: urlHash,
      url,
      term: cleanTerm,
      image_url: imageUrl,
    });
    if (upErr) return res.status(502).json({ ok: false, error: upErr.message });

    // 4) Renvoie
    return res.json({ ok: true, imageUrl, provider, cached: false });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}

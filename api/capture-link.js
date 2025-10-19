// /api/capture-link.js
// Génère un LIEN d'image (pas de rendu serveur) pointant vers un provider de screenshots,
// le stocke/cache dans Supabase, et le renvoie au client.

import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;
const TABLE = process.env.LINKS_TABLE || "capture_links";
const SCREENSHOTONE_KEY = process.env.SCREENSHOTONE_KEY; // optionnel

// --- CORS (pour Framer / navigateur) ---
const setCORS = (res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Max-Age", "600");
};

// Détecte un lien sur-encodé (hérité des versions précédentes)
const looksDoubleEncoded = (s = "") =>
  /https%253A|%252F|%25[0-9A-Fa-f]{2}/.test(s);

// Construit l'URL d'image SANS faire d'appel serveur.
// Branch 1: ScreenshotOne (si tu fournis une clé) ; Branch 2: thum.io (par défaut).
function buildScreenshotURL(targetURL) {
  if (SCREENSHOTONE_KEY) {
    const u = new URL("https://api.screenshotone.com/take");
    u.searchParams.set("access_key", SCREENSHOTONE_KEY);
    u.searchParams.set("url", targetURL.toString());
    u.searchParams.set("format", "jpeg");
    u.searchParams.set("viewport_width", "1280");
    u.searchParams.set("viewport_height", "720");
    u.searchParams.set("block_ads", "true");
    u.searchParams.set("cache", "true");
    return { url: u.toString(), provider: "screenshotone" };
  }

  // IMPORTANT : ne PAS encoder l'URL entière → sinon double-encodage des %C3...
  // On protège uniquement le '#', pour conserver le :~:text
  const safe = targetURL.toString().replace(/#/g, "%23");

  // thum.io : `crop` attend UNE HAUTEUR (px), pas "1280x720"
  // (sinon "crop is not valid.")
  const thum = `https://image.thum.io/get/width/1280/crop/720/noanimate/${safe}`;
  return { url: thum, provider: "thum.io" };
}

export default async function handler(req, res) {
  setCORS(res);
  if (req.method === "OPTIONS") return res.status(204).end();

  // Ping de santé (utile pour vérifier la route)
  if (req.method === "GET") {
    return res.status(200).json({ ok: true, route: "capture-link", tip: "POST { url, term }" });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "POST only" });
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
    return res.status(500).json({ ok: false, error: "Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE" });
  }

  try {
    const { url, term, force } = req.body || {};
    if (!url || !term) return res.status(400).json({ ok: false, error: "Missing url or term" });

    const cleanTerm = String(term).trim().replace(/\s+/g, " ");

    // Ajoute le scroll-to-text pour “viser” le mot dans la page
    const target = new URL(url);
    target.hash = `:~:text=${encodeURIComponent(cleanTerm)}`;

    // Clé de cache déterministe (url + term)
    const urlHash = crypto.createHash("md5").update(`${url}::${cleanTerm}`).digest("hex");

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);

    // 1) Lookup cache (sauf si force===true)
    let cached;
    if (!force) {
      const { data: row } = await supabase
        .from(TABLE)
        .select("image_url")
        .eq("url_hash", urlHash)
        .maybeSingle();
      cached = row?.image_url;
    }

    // 2) Si cache OK et pas douteux → renvoyer
    if (cached && !looksDoubleEncoded(cached)) {
      return res.json({ ok: true, imageUrl: cached, provider: "cache", cached: true });
    }

    // 3) Sinon (ré)générer un lien propre
    const { url: imageUrl, provider } = buildScreenshotURL(target);

    // 4) Persister (upsert) pour les prochains appels
    const { error: upErr } = await supabase.from(TABLE).upsert({
      url_hash: urlHash,
      url,
      term: cleanTerm,
      image_url: imageUrl,
    });
    if (upErr) return res.status(502).json({ ok: false, error: upErr.message });

    // 5) Done
    return res.json({ ok: true, imageUrl, provider, cached: false });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}

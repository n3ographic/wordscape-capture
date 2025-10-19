// /api/capture-link.js
// Génère un LIEN d'image (sans rendu serveur) vers un provider de screenshot,
// le met en cache dans Supabase et le renvoie au client.
//
// Requêtes :
//   GET    /api/capture-link                -> ping santé
//   POST   /api/capture-link { url, term, force? } -> { ok, imageUrl, provider, cached }
//
// Env requis (Vercel):
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE
// Optionnels :
//   LINKS_TABLE=capture_links
//   SCREENSHOTONE_KEY  (si présent, utilise ScreenshotOne au lieu de thum.io)

import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";

// ---------- Config / helpers ----------
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;
const TABLE = process.env.LINKS_TABLE || "capture_links";
const SCREENSHOTONE_KEY = process.env.SCREENSHOTONE_KEY || "";

const setCORS = (res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Max-Age", "600");
};

// détecte une ancienne URL double-encodée
const looksDoubleEncoded = (s = "") =>
  /https%253A|%252F|%25[0-9A-Fa-f]{2}/.test(s);

// corrige d’anciennes URLs thum.io du type /crop/1280x720 => /crop/720
const normalizeThumCrop = (url = "") =>
  url.replace(/\/crop\/(\d+)x(\d+)(\/|$)/, "/crop/$2$3");

// Construit l’URL image SANS fetch serveur
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

  // IMPORTANT : ne PAS encoder toute l’URL ; on protège seulement le '#'
  const safe = targetURL.toString().replace(/#/g, "%23");

  // thum.io : crop attend UNE HAUTEUR (px), pas "WxH" → /crop/720
  const thum = `https://image.thum.io/get/width/1280/crop/720/noanimate/${safe}`;
  return { url: thum, provider: "thum.io" };
}

// ---------- Handler Vercel ----------
export default async function handler(req, res) {
  setCORS(res);
  if (req.method === "OPTIONS") return res.status(204).end();

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

    // nettoie le terme et construit l’ancre scroll-to-text
    const cleanTerm = String(term).trim().replace(/\s+/g, " ");
    const target = new URL(url);
    target.hash = `:~:text=${encodeURIComponent(cleanTerm)}`;

    // clé cache déterministe
    const urlHash = crypto.createHash("md5").update(`${url}::${cleanTerm}`).digest("hex");

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);

    // 1) lecture cache (sauf si force)
    let cached;
    if (!force) {
      const { data: row } = await supabase
        .from(TABLE)
        .select("image_url")
        .eq("url_hash", urlHash)
        .maybeSingle();
      cached = row?.image_url;
    }

    // 2) si cache OK et sain → normalise crop (au cas où) et renvoie
    if (cached && !looksDoubleEncoded(cached)) {
      const normalized = normalizeThumCrop(cached);
      if (normalized !== cached) {
        // met à jour silencieusement la ligne si on a corrigé crop
        await supabase.from(TABLE).update({ image_url: normalized }).eq("url_hash", urlHash);
      }
      return res.json({ ok: true, imageUrl: normalized, provider: "cache", cached: true });
    }

    // 3) sinon (ré)génère un lien propre
    const { url: imageUrlRaw, provider } = buildScreenshotURL(target);
    const imageUrl = normalizeThumCrop(imageUrlRaw);

    // 4) upsert pour le prochain appel
    const { error: upErr } = await supabase.from(TABLE).upsert({
      url_hash: urlHash,
      url,
      term: cleanTerm,
      image_url: imageUrl,
    });
    if (upErr) return res.status(502).json({ ok: false, error: upErr.message });

    // 5) done
    return res.json({ ok: true, imageUrl, provider, cached: false });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}

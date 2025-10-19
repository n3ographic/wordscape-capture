// /api/capture-link.js
// POST { url, term } -> { ok, imageUrl, provider, cached }
// Génère un lien de screenshot (sans télécharger l'image), le stocke dans Supabase et le renvoie.

import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";

const CORS = (res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Max-Age", "600");
};

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;
const TABLE = process.env.LINKS_TABLE || "capture_links";

// Construis une URL de screenshot (sans appel réseau)
function buildScreenshotURL(targetURL) {
  const SCREENSHOTONE_KEY = process.env.SCREENSHOTONE_KEY; // optionnel
  if (SCREENSHOTONE_KEY) {
    const base = new URL("https://api.screenshotone.com/take");
    base.searchParams.set("access_key", SCREENSHOTONE_KEY);
    base.searchParams.set("url", targetURL);
    base.searchParams.set("format", "jpeg");
    base.searchParams.set("viewport_width", "1280");
    base.searchParams.set("viewport_height", "720");
    base.searchParams.set("block_ads", "true");
    base.searchParams.set("cache", "true");
    return { url: base.toString(), provider: "screenshotone" };
  }

  // fallback sans clé : thum.io (rend une image directement)
  // (on ne l'appelle pas côté serveur — <img> la chargera côté client)
  const thum = `https://image.thum.io/get/width/1280/crop/1280x720/noanimate/${encodeURIComponent(
    targetURL
  )}`;
  return { url: thum, provider: "thum.io" };
}

export default async function handler(req, res) {
  CORS(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "POST only" });

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
    return res.status(500).json({ ok: false, error: "Missing SUPABASE env vars" });
  }

  try {
    const { url, term } = req.body || {};
    if (!url || !term) return res.status(400).json({ ok: false, error: "Missing url or term" });

    const cleanTerm = String(term).trim().replace(/\s+/g, " ");
    const target = new URL(url);
    // Scroll-To-Text highlight
    target.hash = `:~:text=${encodeURIComponent(cleanTerm)}`;

    // clé de cache déterministe
    const urlHash = crypto.createHash("md5").update(`${url}::${cleanTerm}`).digest("hex");

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);

    // 1) cache lookup
    const { data: row } = await supabase
      .from(TABLE)
      .select("image_url")
      .eq("url_hash", urlHash)
      .maybeSingle();

    if (row?.image_url) {
      return res.json({ ok: true, imageUrl: row.image_url, provider: "cache", cached: true });
    }

    // 2) génère un lien de screenshot (AUCUN fetch ici)
    const { url: imageUrl, provider } = buildScreenshotURL(target.toString());

    // 3) stocke le lien
    const { error: upErr } = await supabase.from(TABLE).upsert({
      url_hash: urlHash,
      url,
      term: cleanTerm,
      image_url: imageUrl
    });
    if (upErr) return res.status(502).json({ ok: false, error: upErr.message });

    // 4) renvoie le lien
    return res.json({ ok: true, imageUrl, provider, cached: false });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}

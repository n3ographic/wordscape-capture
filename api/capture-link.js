// /api/capture-link.js
import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;
const TABLE = process.env.LINKS_TABLE || "capture_links";

const cors = (res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Max-Age", "600");
};

// petit helper : repère les URLs sur-encodées (https%253A, %252F, %25C3, etc.)
const looksDoubleEncoded = (s = "") =>
  /https%253A|%252F|%25[0-9A-Fa-f]{2}/.test(s);

// construit le lien image depuis le provider (aucun fetch côté serveur)
function buildScreenshotURL(targetURL) {
  const key = process.env.SCREENSHOTONE_KEY; // optionnel
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
  // IMPORTANT : pas de double-encodage ; on protège seulement '#'
  const safe = targetURL.toString().replace(/#/g, "%23");
  const thum = `https://image.thum.io/get/width/1280/crop/1280x720/noanimate/${safe}`;
  return { url: thum, provider: "thum.io" };
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();

  if (req.method === "GET") {
    return res.status(200).json({ ok: true, route: "capture-link", tip: "POST { url, term }" });
  }
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "POST only" });
  }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
    return res.status(500).json({ ok: false, error: "Missing SUPABASE env vars" });
  }

  try {
    const { url, term, force } = req.body || {};
    if (!url || !term) return res.status(400).json({ ok: false, error: "Missing url or term" });

    const cleanTerm = String(term).trim().replace(/\s+/g, " ");
    const target = new URL(url);
    target.hash = `:~:text=${encodeURIComponent(cleanTerm)}`;

    // clé de cache déterministe
    const urlHash = crypto.createHash("md5").update(`${url}::${cleanTerm}`).digest("hex");

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);

    // 1) lookup cache
    let cached;
    if (!force) {
      const { data: row } = await supabase
        .from(TABLE)
        .select("image_url")
        .eq("url_hash", urlHash)
        .maybeSingle();
      cached = row?.image_url;
    }

    // 2) si cache OK et pas double-encodé → on renvoie
    if (cached && !looksDoubleEncoded(cached)) {
      return res.json({ ok: true, imageUrl: cached, provider: "cache", cached: true });
    }

    // 3) sinon, (ré)génère un lien propre
    const { url: imageUrl, provider } = buildScreenshotURL(target);

    // 4) upsert
    const { error: upErr } = await supabase.from(TABLE).upsert({
      url_hash: urlHash,
      url,
      term: cleanTerm,
      image_url: imageUrl,
    });
    if (upErr) return res.status(502).json({ ok: false, error: upErr.message });

    return res.json({ ok: true, imageUrl, provider, cached: false });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}

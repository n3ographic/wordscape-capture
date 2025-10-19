import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;
const TABLE = process.env.LINKS_TABLE || "capture_links";

const setCORS = (res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Max-Age", "600");
};
const looksDoubleEncoded = (s = "") => /https%253A|%252F|%25[0-9A-Fa-f]{2}/.test(s);
const normalizeThumCrop = (url = "") => url.replace(/\/crop\/(\d+)x(\d+)(\/|$)/, "/crop/$2$3");

function pageScreenshotURL(targetURL) {
  // Page entière : thum.io (simple/rapide)
  const safe = targetURL.toString().replace(/#/g, "%23");
  const thum = `https://image.thum.io/get/width/1280/crop/720/noanimate/${safe}`;
  return { url: thum, provider: "thum.io" };
}

export default async function handler(req, res) {
  setCORS(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method === "GET") return res.status(200).json({ ok: true, route: "capture-link", tip: "POST { url, term }" });
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "POST only" });
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) return res.status(500).json({ ok: false, error: "Missing SUPABASE envs" });

  try {
    const { url, term, force } = req.body || {};
    if (!url || !term) return res.status(400).json({ ok: false, error: "Missing url or term" });

    const cleanTerm = String(term).trim().replace(/\s+/g, " ");
    const target = new URL(url);
    target.hash = `:~:text=${encodeURIComponent(cleanTerm)}`;

    const urlHash = crypto.createHash("md5").update(`${url}::${cleanTerm}`).digest("hex");
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);

    let cached;
    if (!force) {
      const { data: row } = await supabase.from(TABLE).select("image_url").eq("url_hash", urlHash).maybeSingle();
      cached = row?.image_url;
    }
    if (cached && !looksDoubleEncoded(cached)) {
      const normalized = normalizeThumCrop(cached);
      if (normalized !== cached) await supabase.from(TABLE).update({ image_url: normalized }).eq("url_hash", urlHash);
      return res.json({ ok: true, imageUrl: normalized, provider: "cache", cached: true });
    }

    const { url: imageUrlRaw, provider } = pageScreenshotURL(target);
    const imageUrl = normalizeThumCrop(imageUrlRaw);

    const { error: upErr } = await supabase.from(TABLE).upsert({
      url_hash: urlHash, url, term: cleanTerm, image_url: imageUrl
    });
    if (upErr) return res.status(502).json({ ok: false, error: upErr.message });

    return res.json({ ok: true, imageUrl, provider, cached: false });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}

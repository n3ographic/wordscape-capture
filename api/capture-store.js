// /api/capture-store.js
// POST { url, term } -> JSON { ok, imageUrl, path }
// 1) Surligne via #:~:text=<term>, 2) capture via Microlink, 3) upload dans Supabase Storage.

import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";

const CORS = (res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Max-Age", "600");
};

function fetchWithTimeout(url, options = {}, ms = 8000) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { ...options, signal: ctrl.signal }).finally(() => clearTimeout(id));
}

export default async function handler(req, res) {
  CORS(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST")   return res.status(405).json({ ok: false, error: "POST only" });

  const { url, term } = req.body || {};
  if (!url || !term) return res.status(400).json({ ok: false, error: "Missing url or term" });

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;
  const BUCKET = process.env.BUCKET_NAME || "shots";
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
    return res.status(500).json({ ok: false, error: "Missing SUPABASE env vars" });
  }

  try {
    // 1) URL cible + surlignage
    const cleanTerm = String(term).trim().replace(/\s+/g, " ");
    const target = new URL(url);
    target.hash = `:~:text=${encodeURIComponent(cleanTerm)}`;

    // 2) Capture via Microlink (timeout court)
    const api = new URL("https://api.microlink.io/");
    api.searchParams.set("url", target.toString());
    api.searchParams.set("screenshot", "true");
    api.searchParams.set("meta", "false");
    api.searchParams.set("screenshot.type", "jpeg");
    api.searchParams.set("screenshot.device", "desktop");
    api.searchParams.set("screenshot.viewport.width", "1280");
    api.searchParams.set("screenshot.viewport.height", "720");
    api.searchParams.set("waitForTimeout", "600");

    const r = await fetchWithTimeout(api, {}, 8000);
    const j = await r.json().catch(() => null);
    const upstreamUrl = j?.data?.screenshot?.url;
    if (!r.ok || !upstreamUrl) {
      return res.status(502).json({ ok: false, error: j?.error?.message || "Screenshot failed" });
    }

    // 3) Télécharge l'image
    const imgRes = await fetchWithTimeout(upstreamUrl, {}, 8000);
    if (!imgRes.ok) return res.status(502).json({ ok: false, error: "Image fetch failed" });
    const buf = Buffer.from(await imgRes.arrayBuffer());

    // 4) Upload dans Supabase Storage
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);
    const key = crypto
      .createHash("md5")
      .update(`${url}::${cleanTerm}`)
      .digest("hex");

    const filename = `${key}_${Date.now()}.jpg`;
    const path = `${filename}`;

    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(path, buf, { contentType: "image/jpeg", upsert: false });

    if (upErr) {
      // si le fichier existe déjà, on renvoie le public URL
      if (!String(upErr.message || "").toLowerCase().includes("duplicate")) {
        return res.status(502).json({ ok: false, error: upErr.message });
      }
    }

    // 5) Public URL (bucket public) ou Signed URL (bucket privé)
    // -- Public (plus simple) :
    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
    const imageUrl = pub?.publicUrl;

    if (!imageUrl) return res.status(500).json({ ok: false, error: "Cannot get public URL" });

    return res.json({ ok: true, imageUrl, path, term: cleanTerm, source: target.toString() });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}

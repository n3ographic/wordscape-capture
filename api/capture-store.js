// /api/capture-store.js
// POST { url, term } -> { ok, imageUrl, path, source }
// Cache Supabase via table `captures` (clé = md5(url::term))
// Capture via Microlink + surlignage #:~:text=<term>

import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";

const CORS = (res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Max-Age", "600");
};

const BUCKET = process.env.BUCKET_NAME || "shots";
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;

function fetchWithTimeout(url, options = {}, ms = 20000) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { ...options, signal: ctrl.signal }).finally(() => clearTimeout(id));
}

export default async function handler(req, res) {
  CORS(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST")   return res.status(405).json({ ok: false, error: "POST only" });
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE)
    return res.status(500).json({ ok: false, error: "Missing SUPABASE env vars" });

  try {
    const { url, term } = req.body || {};
    if (!url || !term) return res.status(400).json({ ok: false, error: "Missing url or term" });

    const cleanTerm = String(term).trim().replace(/\s+/g, " ");
    const urlHash = crypto.createHash("md5").update(`${url}::${cleanTerm}`).digest("hex");
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);

    // 1) Lookup cache
    const { data: row } = await supabase
      .from("captures")
      .select("path")
      .eq("url_hash", urlHash)
      .maybeSingle();

    if (row?.path) {
      const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(row.path);
      if (pub?.publicUrl) {
        return res.json({ ok: true, imageUrl: pub.publicUrl, path: row.path, cached: true });
      }
    }

    // 2) Build target URL with text fragment (#:~:text=)
    const target = new URL(url);
    target.hash = `:~:text=${encodeURIComponent(cleanTerm)}`;

    // 3) Ask Microlink (timeout court pour éviter Vercel timeout)
    const api = new URL("https://api.microlink.io/");
    api.searchParams.set("url", target.toString());
    api.searchParams.set("screenshot", "true");
    api.searchParams.set("meta", "false");
    api.searchParams.set("screenshot.type", "jpeg");
    api.searchParams.set("screenshot.device", "desktop");
    api.searchParams.set("screenshot.viewport.width", "1280");
    api.searchParams.set("screenshot.viewport.height", "720");
    api.searchParams.set("waitForTimeout", "600");

    const r = await fetchWithTimeout(api, {}, 20000);
    const j = await r.json().catch(() => null);
    const upstreamUrl = j?.data?.screenshot?.url;
    if (!r.ok || !upstreamUrl)
      return res.status(502).json({ ok: false, error: j?.error?.message || "Screenshot failed" });

    // 4) Download image
    const imgRes = await fetchWithTimeout(upstreamUrl, {}, 20000);
    if (!imgRes.ok) return res.status(502).json({ ok: false, error: "Image fetch failed" });
    const buf = Buffer.from(await imgRes.arrayBuffer());

    // 5) Upload (clé déterministe = url_hash.jpg) avec upsert
    const path = `${urlHash}.jpg`;
    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(path, buf, { contentType: "image/jpeg", upsert: true });
    if (upErr) return res.status(502).json({ ok: false, error: upErr.message });

    // 6) Upsert metadata
    await supabase
      .from("captures")
      .upsert({ url_hash: urlHash, url, term: cleanTerm, path }, { onConflict: "url_hash" });

    // 7) Public URL
    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
    if (!pub?.publicUrl) return res.status(500).json({ ok: false, error: "Cannot get public URL" });

    return res.json({ ok: true, imageUrl: pub.publicUrl, path, source: target.toString(), cached: false });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}

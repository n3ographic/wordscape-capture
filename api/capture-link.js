import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const setCORS = (res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Max-Age", "600");
};

function thumUrl(targetURL) {
  const safe = targetURL.toString().replace(/#/g, "%23");
  return `https://image.thum.io/get/width/1280/crop/720/noanimate/${safe}`;
}

export default async function handler(req, res) {
  setCORS(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method === "GET") return res.status(200).json({ ok: true, route: "capture-link", tip: "POST { url, term }" });
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "POST only" });

  try {
    const { url, term, force = false } = req.body || {};
    if (!url || !term) return res.status(400).json({ ok: false, error: "Missing url or term" });

    // prépare l’URL avec ancre simple sur le terme (utile si le site supporte :~:text)
    const target = new URL(url);
    target.hash = `:~:text=${encodeURIComponent(String(term).trim())}`;

    const imageUrl = thumUrl(target);

    const hasSupabase =
      process.env.SUPABASE_URL &&
      (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY);

    if (!hasSupabase) {
      return res.json({ ok: true, imageUrl, provider: "thum.io", cached: false });
    }

    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
    const supabase = createClient(process.env.SUPABASE_URL, key, { auth: { persistSession: false } });
    const urlHash = crypto.createHash("md5").update(`${url}::${term}`).digest("hex");
    const table = process.env.SUPABASE_TABLE_CAPTURES || "captures";

    if (!force) {
      const { data: row } = await supabase.from(table).select("image_url").eq("id", urlHash).maybeSingle();
      if (row?.image_url) {
        return res.json({ ok: true, imageUrl: row.image_url, provider: "cache", cached: true });
      }
    }

    await supabase.from(table).upsert({
      id: urlHash,
      url,
      term,
      image_url: imageUrl,
      provider: "thum.io"
    });

    res.json({ ok: true, imageUrl, provider: "thum.io", cached: false });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}

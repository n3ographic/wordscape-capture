// api/capture-link.js
import { cors, ok, bad } from "./_utils.js";
import { microlinkShotUrl, thumioShotUrl } from "./_microlink.js";

export default async function handler(req, res) {
  cors(res, "*");

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    return res.end();
  }

  if (req.method === "GET") {
    return ok(res, { ok: true, route: "capture-link", tip: "Use POST { url, term, index? }" });
  }

  if (req.method !== "POST") {
    return bad(res, "Method not allowed", 405);
  }

  try {
    const { url, term, index = 1, provider = "microlink" } =
      typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};

    if (!url || !term) return bad(res, "Missing 'url' or 'term'");

    let imageUrl = microlinkShotUrl(url, term, index);
    let used = "microlink";

    // (Optionnel) petit test HEAD pour basculer en fallback si nécessaire
    // try {
    //   const r = await fetch(imageUrl, { method: "HEAD" });
    //   if (!r.ok) throw new Error();
    // } catch {
    //   imageUrl = thumioShotUrl(url, term);
    //   used = "thum.io";
    // }

    return ok(res, { ok: true, imageUrl, provider: used, index: Number(index) });
  } catch (err) {
    return bad(res, err?.message || "Unexpected error", 500);
  }
}

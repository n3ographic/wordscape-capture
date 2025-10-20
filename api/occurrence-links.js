// api/occurrence-links.js
import { cors, ok, bad } from "./_utils.js";
import { microlinkShotUrl } from "./_microlink.js";

export default async function handler(req, res) {
  cors(res, "*");

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    return res.end();
  }

  if (req.method !== "POST") {
    return bad(res, "Use POST { url, term, max? }");
  }

  try {
    const { url, term, max = 5 } =
      typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};

    if (!url || !term) return bad(res, "Missing 'url' or 'term'");

    const n = Math.max(1, Math.min(Number(max) || 1, 50)); // garde un plafond raisonnable
    const items = [];

    for (let i = 1; i <= n; i++) {
      const imageUrl = microlinkShotUrl(url, term, i);
      items.push({ index: i, url, term, imageUrl, provider: "microlink" });
    }

    return ok(res, { ok: true, count: items.length, items });
  } catch (err) {
    return bad(res, err?.message || "Unexpected error", 500);
  }
}

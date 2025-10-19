// /api/proxy-image.js
const CORS = (res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Max-Age", "600");
};

const ALLOW_HOSTS = new Set([
  "image.thum.io",
  "api.screenshotone.com",
  "screenshotone.com",
  "api.microlink.io" // 👈 Microlink
]);

export default async function handler(req, res) {
  CORS(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return res.status(405).send("GET only");

  const raw = req.query.src;
  if (!raw) return res.status(400).send("Missing src");

  let decoded = Array.isArray(raw) ? raw[0] : raw;
  try { decoded = decodeURIComponent(decoded); } catch {}

  let u;
  try { u = new URL(decoded); } catch { return res.status(400).send("Invalid src"); }
  if (!ALLOW_HOSTS.has(u.hostname)) return res.status(400).send("Host not allowed");

  try {
    const microlink = u.hostname === "api.microlink.io";
    const headers = {
      "User-Agent": req.headers["user-agent"] || "Mozilla/5.0",
      ...(microlink && process.env.MICROLINK_KEY ? { "x-api-key": process.env.MICROLINK_KEY } : {})
    };

    const ctrl = new AbortController();
    const id = setTimeout(() => ctrl.abort(), 15000);

    const r = await fetch(u.toString(), { signal: ctrl.signal, headers });
    clearTimeout(id);

    if (!r.ok) {
      const text = await r.text().catch(() => "");
      return res.status(r.status).send(text || `Upstream ${r.status}`);
    }

    res.setHeader("Cache-Control", "public, max-age=0, s-maxage=86400, stale-while-revalidate=604800");
    res.setHeader("Content-Type", r.headers.get("content-type") || "image/jpeg");

    const buf = Buffer.from(await r.arrayBuffer());
    return res.status(200).send(buf);
  } catch (e) {
    return res.status(502).send(String(e?.message || e));
  }
}

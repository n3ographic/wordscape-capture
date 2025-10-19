// /api/proxy-image.js
// GET /api/proxy-image?src=<absolute image url>
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
]);

export default async function handler(req, res) {
  CORS(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return res.status(405).send("GET only");

  const src = req.query.src;
  if (!src) return res.status(400).send("Missing src");

  let u;
  try {
    u = new URL(src);
  } catch {
    return res.status(400).send("Invalid src");
  }
  if (!ALLOW_HOSTS.has(u.hostname)) return res.status(400).send("Host not allowed");

  try {
    const ctrl = new AbortController();
    const id = setTimeout(() => ctrl.abort(), 12000);
    const r = await fetch(u, { signal: ctrl.signal });
    clearTimeout(id);

    if (!r.ok) {
      const t = await r.text();
      return res.status(r.status).send(t);
    }

    res.setHeader(
      "Cache-Control",
      "public, max-age=0, s-maxage=86400, stale-while-revalidate=604800"
    );
    res.setHeader("Content-Type", r.headers.get("content-type") || "image/jpeg");

    const buf = Buffer.from(await r.arrayBuffer());
    return res.status(200).send(buf);
  } catch (e) {
    return res.status(502).send(String(e?.message || e));
  }
}

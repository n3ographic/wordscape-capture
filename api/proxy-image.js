const CORS = (res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Max-Age", "600");
};

const ALLOW_SUFFIX = ["microlink.io", "thum.io", "screenshotone.com"];

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
  const okHost = ALLOW_SUFFIX.some(sfx => u.hostname === sfx || u.hostname.endsWith(`.${sfx}`));
  if (!okHost) return res.status(400).send("Host not allowed");

  try {
    const headers = { "User-Agent": req.headers["user-agent"] || "Mozilla/5.0" };
    // Si un jour tu ajoutes MICROLINK_API_KEY (plan payant) :
    if ((u.hostname.endsWith("microlink.io")) && process.env.MICROLINK_API_KEY) {
      headers["x-api-key"] = process.env.MICROLINK_API_KEY;
    }

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
    res.status(200).send(buf);
  } catch (e) {
    res.status(502).send(String(e?.message || e));
  }
}

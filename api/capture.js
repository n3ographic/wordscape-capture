// /api/capture.js
// POST { url, term } -> image/jpeg
// Capture via Microlink + surlignage avec #:~:text=<term>

const cors = (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Max-Age", "600");
};

export default async function handler(req, res) {
  cors(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).send("POST only");

  try {
    const { url, term } = req.body || {};
    if (!url || !term) return res.status(400).send("Missing url or term");

    const cleanTerm = String(term).trim().replace(/\s+/g, " ");
    const target = new URL(url);
    // Surligne le mot dans la page (Chrome Scroll To Text)
    target.hash = `:~:text=${encodeURIComponent(cleanTerm)}`;

    // Appel Microlink -> screenshot JPEG
    const api = new URL("https://api.microlink.io/");
    api.searchParams.set("url", target.toString());
    api.searchParams.set("screenshot", "true");
    api.searchParams.set("meta", "false");
    api.searchParams.set("screenshot.type", "jpeg");
    api.searchParams.set("screenshot.device", "desktop");
    api.searchParams.set("screenshot.viewport.width", "1280");
    api.searchParams.set("screenshot.viewport.height", "720");
    api.searchParams.set("waitForTimeout", "800");

    const r = await fetch(api);
    const j = await r.json();
    const imgUrl = j?.data?.screenshot?.url;
    if (!r.ok || !imgUrl) {
      return res.status(502).send(j?.error?.message || "Failed to capture screenshot.");
    }

    const imgRes = await fetch(imgUrl);
    if (!imgRes.ok) return res.status(502).send("Upstream image fetch failed.");
    const buf = Buffer.from(await imgRes.arrayBuffer());

    res.setHeader("Content-Type", "image/jpeg");
    res.setHeader("Cache-Control", "no-store");
    return res.send(buf);
  } catch (e) {
    return res.status(500).send(String(e?.message || e));
  }
}

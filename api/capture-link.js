import { setCORS, okOptions } from "./_cors.js";

const buildMicrolinkShot = (targetUrl) => {
  // Microlink renvoie une page JSON; pour avoir *directement* l’URL d’image, on utilise embed=screenshot.url
  const u = new URL("https://api.microlink.io/");
  u.searchParams.set("url", targetUrl);
  u.searchParams.set("screenshot", "true");
  u.searchParams.set("meta", "false");
  u.searchParams.set("embed", "screenshot.url");
  u.searchParams.set("waitUntil", "networkidle2");
  u.searchParams.set("viewport.width", "1280");
  u.searchParams.set("viewport.height", "720");
  return u.toString();
};

export default async function handler(req, res) {
  if (okOptions(req, res)) return;
  setCORS(res);

  if (req.method !== "POST")
    return res.status(405).json({ ok: false, error: "POST only" });

  const { url, term } = req.body || {};
  if (!url || !term) return res.status(400).json({ ok: false, error: "Missing url or term" });

  // Text Fragment pour surligner le mot (toutes occurrences par défaut)
  const anchored = new URL(url);
  anchored.hash = `:~:text=${encodeURIComponent(term)}`;

  const imageUrl = buildMicrolinkShot(anchored.toString());
  return res.status(200).json({ ok: true, imageUrl, provider: "microlink" });
}

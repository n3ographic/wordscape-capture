import { setCORS, okOptions } from "./_cors.js";

const norm = (s) =>
  s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

const buildMicrolinkShot = (targetUrl) => {
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

  const { url, term, max = 6, contextWords = 5 } = req.body || {};
  if (!url || !term) return res.status(400).json({ ok: false, error: "Missing url or term" });

  // Récupère la page
  const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!r.ok) return res.status(r.status).json({ ok: false, error: `Fetch failed (${r.status})` });
  const html = await r.text();

  // Texte brut (rapide)
  const textOnly = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const words = textOnly.split(/\s+/);
  const wordsNorm = words.map(norm);
  const needle = norm(term);

  const hits = [];
  for (let i = 0; i < wordsNorm.length; i++) {
    if (wordsNorm[i].includes(needle)) {
      const start = Math.max(0, i - contextWords);
      const end = Math.min(words.length, i + 1 + contextWords);
      const before = words.slice(start, i).join(" ").slice(-80);
      const target = words[i];
      const after  = words.slice(i + 1, end).join(" ").slice(0, 80);

      // Text Fragment avec préfixe -> `text=prefix-,target`
      const fragment = `:~:text=${encodeURIComponent(before)}-,${encodeURIComponent(target)}`;
      const anchoredUrl = new URL(url);
      anchoredUrl.hash = fragment;

      hits.push({
        index: i,
        before,
        target,
        after,
        url: anchoredUrl.toString(),
        imageUrl: buildMicrolinkShot(anchoredUrl.toString())
      });

      if (hits.length >= Number(max)) break;
    }
  }

  return res.status(200).json({
    ok: true,
    count: hits.length,
    term,
    url,
    items: hits
  });
}

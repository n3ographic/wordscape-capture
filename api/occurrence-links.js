// /api/occurrence-links.js
import { withCors } from './_cors.js';

// CSS compact appliqué au highlight natif Chrome (Text Fragments)
const HIGHLIGHT_CSS =
  '::target-text{background:#fff44b!important;box-shadow:0 0 0 6px rgba(255,244,75,.85)!important;border-radius:6px!important;color:inherit!important;text-shadow:none!important}';

function microlinkUrl(pageUrlWithFragment) {
  const p = new URLSearchParams({
    url: pageUrlWithFragment,
    screenshot: 'true',
    meta: 'false',
    embed: 'screenshot.url',
    // On attend que le réseau soit calme + on laisse 600 ms pour le paint du highlight
    waitUntil: 'networkidle2',
    'screenshot.delay': '600',
    'viewport.width': '1280',
    'viewport.height': '720',
    // centre le fragment ciblé
    scrollTo: ':target-text',
    scrollBehavior: 'center',
    // couleur du surlignage
    styles: HIGHLIGHT_CSS,
    as: 'image'
  });
  return `https://api.microlink.io/?${p.toString()}`;
}

function fallbackUrl(pageUrlWithFragment) {
  // fallback très court pour éviter les 400
  return `https://image.thum.io/get/width/1280/crop/720/noanimate/${encodeURIComponent(pageUrlWithFragment)}`;
}

export default withCors(async (req, res) => {
  try {
    if (req.method !== 'POST')
      return res.status(405).json({ ok: false, error: 'Use POST' });

    const body = typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}');
    const pageUrl = String(body.url || '').trim();
    const term    = String(body.term || '').trim();
    const max     = Math.min(Number(body.max || 6) || 6, 20);

    if (!pageUrl || !term)
      return res.status(400).json({ ok: false, error: 'Missing `url` or `term`' });

    const normalized = new URL(pageUrl).toString();

    // ✅ Text Fragment natif (highlight + scroll auto dans Chromium)
    const fragment = `:~:text=${encodeURIComponent(term)}`;
    const urlWithFragment = `${normalized}#${fragment}`;

    const items = Array.from({ length: max }, (_, i) => ({
      index: i + 1,
      url: urlWithFragment,
      term,
      imageUrl: microlinkUrl(urlWithFragment),        // ← mets directement ça dans <img src=...>
      fallbackUrl: fallbackUrl(urlWithFragment),      // ← à utiliser seulement en onError
      fragment,
      provider: 'microlink'
    }));

    res.status(200).json({ ok: true, count: items.length, term, url: normalized, items });
  } catch (e) {
    res.status(200).json({ ok: false, error: String(e?.message || e) });
  }
});

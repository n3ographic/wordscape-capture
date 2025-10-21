// /api/occurrence-links.js
import { withCors } from './_cors.js';

const HIGHLIGHT_CSS = `
  ::target-text{
    background:#fff44b !important;
    box-shadow:0 0 0 6px rgba(255,244,75,.85) !important;
    border-radius:6px !important;
    color:inherit !important;
    text-shadow:none !important;
  }
`;

function buildMicrolink(url, fragment) {
  const qs = new URLSearchParams({
    url,
    screenshot: 'true',
    meta: 'false',
    embed: 'screenshot.url',
    waitUntil: 'networkidle2',
    'viewport.width': '1280',
    'viewport.height': '720',
    scrollTo: ':target-text',
    scrollBehavior: 'center',
    styles: HIGHLIGHT_CSS,
    as: 'image',
  });
  return `https://api.microlink.io/?${qs.toString()}`;
}

export default withCors(async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ ok: false, error: 'Use POST' });
    }

    // body peut déjà être parsé par Vercel; sécurisons:
    const body = typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}');

    const pageUrl = String(body.url || '').trim();
    const term    = String(body.term || '').trim();
    const max     = Math.min(Number(body.max || 6) || 6, 20);

    if (!pageUrl || !term) {
      return res.status(400).json({ ok: false, error: 'Missing `url` or `term`' });
    }

    // Valide/normalise l’URL (peut throw -> catch)
    const u = new URL(pageUrl);
    const normalized = u.toString();

    // Ici, sans crawler, on ne peut pas calculer les vrais contextes.
    // On génère jusqu’à `max` occurrences avec le même fragment text-fragment
    // (le rendu sera centré et surligné, c'est ce que tu veux visuellement).
    const fragment = `:~:text=${encodeURIComponent(term)}`;
    const items = Array.from({ length: max }, (_, i) => {
      const urlWithFragment = `${normalized}${normalized.includes('#') ? '' : ''}#${fragment}`;
      return {
        index: i + 1,
        url: urlWithFragment,
        term,
        imageUrl: buildMicrolink(urlWithFragment, fragment),
        fallbackUrl: `https://image.thum.io/get/width/1280/crop/720/noanimate/${encodeURIComponent(urlWithFragment)}`,
        fragment,
        provider: 'microlink',
      };
    });

    return res.status(200).json({
      ok: true,
      count: items.length,
      term,
      url: normalized,
      items,
    });
  } catch (err) {
    // <- Jamais de 500 côté client; on renvoie une 200 avec ok:false
    return res.status(200).json({
      ok: false,
      error: String(err && err.message ? err.message : err),
    });
  }
});

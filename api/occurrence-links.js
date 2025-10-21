// /api/occurrence-links.js
import { withCors } from './_cors.js';

const ORIGIN =
  process.env.APP_ORIGIN || 'https://wordscape-capture.vercel.app';

// CSS du <mark> dans la page capturée (compact)
const HIGHLIGHT_CSS =
  'mark.__w{background:#fff44b!important;box-shadow:0 0 0 6px rgba(255,244,75,.85)!important;border-radius:6px!important;padding:0 .2em;color:inherit!important;text-shadow:none!important}';

function microlinkUrl(pageUrl, term) {
  const params = new URLSearchParams({
    url: pageUrl,
    screenshot: 'true',
    meta: 'false',
    embed: 'screenshot.url',
    waitUntil: 'networkidle2',
    'viewport.width': '1280',
    'viewport.height': '720',
    styles: HIGHLIGHT_CSS,
    as: 'image'
  });
  // Script d’annotation servi depuis TON app (URL très courte)
  params.append('scripts', `${ORIGIN}/api/inject.js?term=${encodeURIComponent(term)}`);
  return `https://api.microlink.io/?${params.toString()}`;
}

function fallbackUrl(pageUrl) {
  return `https://image.thum.io/get/width/1280/crop/720/noanimate/${encodeURIComponent(pageUrl)}`;
}

export default withCors(async (req, res) => {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ ok: false, error: 'Use POST' });
    }
    const body = typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}');
    const pageUrl = String(body.url || '').trim();
    const term    = String(body.term || '').trim();
    const max     = Math.min(Number(body.max || 6) || 6, 20);

    if (!pageUrl || !term) {
      return res.status(400).json({ ok: false, error: 'Missing `url` or `term`' });
    }

    const normalized = new URL(pageUrl).toString();

    // Sans crawl complet on renvoie `max` fois la 1ʳᵉ occurrence (centrée)
    const items = Array.from({ length: max }, (_, i) => {
      const imageUrl = microlinkUrl(normalized, term);
      return {
        index: i + 1,
        url: normalized,
        term,
        imageUrl,                 // ➜ mets ça DIRECTEMENT dans <img src=...>
        fallbackUrl: fallbackUrl(normalized),
        provider: 'microlink'
      };
    });

    return res.status(200).json({
      ok: true,
      count: items.length,
      term,
      url: normalized,
      items
    });
  } catch (e) {
    return res.status(200).json({ ok: false, error: String(e?.message || e) });
  }
});

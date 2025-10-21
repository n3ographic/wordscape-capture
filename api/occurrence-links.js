// /api/occurrence-links.js
import { withCors } from './_cors.js';

function cssHighlight({ color = '#fff44b', pad = 6 }) {
  return `
    ::target-text{
      background:${color} !important;
      box-shadow:0 0 0 ${pad}px rgba(255,244,75,.85) !important;
      border-radius:6px !important;
      color:inherit !important;
      text-shadow:none !important;
    }
  `;
}

function buildMicrolinkURL({
  url,
  styles,
  vw = 1280,
  vh = 720,
  dpr = 1,
  type = 'png',
  quality, // only for jpeg
  scrollBehavior = 'center',
}) {
  const q = new URLSearchParams({
    url,
    screenshot: 'true',
    meta: 'false',
    embed: 'screenshot.url',
    waitUntil: 'networkidle2',
    'viewport.width': String(vw),
    'viewport.height': String(vh),
    deviceScaleFactor: String(dpr),
    scrollTo: ':target-text',
    scrollBehavior,
    styles,
    as: 'image',
    type, // png | jpeg | webp
  });
  if (type === 'jpeg' && quality) q.set('quality', String(quality));
  return `https://api.microlink.io/?${q.toString()}`;
}

export default withCors(async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Use POST' });

  const body = typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}');

  const pageUrl = String(body.url || '').trim();
  const term = String(body.term || '').trim();
  const max = Math.min(Number(body.max || 6) || 6, 20);

  const color = (body.color || '#fff44b').trim();
  const pad = Math.max(0, Number(body.pad || 6) || 6);
  const vw = Number(body.vw || 1280) || 1280;
  const vh = Number(body.vh || 720) || 720;
  const dpr = Number(body.dpr || 1) || 1;
  const type = String(body.type || 'png');
  const quality = body.quality ? Number(body.quality) : undefined;
  const scrollBehavior = String(body.scrollBehavior || 'center');

  if (!pageUrl || !term) {
    return res.status(400).json({ ok: false, error: 'Missing `url` or `term`' });
  }

  // valide l'URL, normalise
  const normalized = new URL(pageUrl).toString();

  // On utilise un fragment text-fragment; sans crawler on duplique `max` fois
  // pour faire défiler des captures centrées sur la même occurrence.
  const fragment = `:~:text=${encodeURIComponent(term)}`;

  const styles = cssHighlight({ color, pad });

  const items = Array.from({ length: max }, (_, i) => {
    const urlWithFragment = `${normalized}#${fragment}`;
    return {
      index: i + 1,
      url: urlWithFragment,
      term,
      imageUrl: buildMicrolinkURL({
        url: urlWithFragment,
        styles,
        vw,
        vh,
        dpr,
        type,
        quality,
        scrollBehavior,
      }),
      fallbackUrl: `https://image.thum.io/get/width/${vw}/crop/${vh}/noanimate/${encodeURIComponent(
        urlWithFragment
      )}`,
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
});

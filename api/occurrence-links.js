import { withCORS } from './_cors';

// util: origine (https://xxx.vercel.app) pour fabriquer l'URL proxifiée
function getOrigin(req) {
  const proto = (req.headers['x-forwarded-proto'] || 'https').split(',')[0];
  const host = (req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0];
  return `${proto}://${host}`;
}

// fabrique l'URL Microlink une seule fois (PAS de double encodage)
function buildMicrolinkImageURL({ pageUrl, term, radius = 6 }) {
  // fragment de texte (sur tous les navigateurs récents)
  const urlWithFragment = `${pageUrl}#:~:text=${encodeURIComponent(term)}`;

  // CSS jaune sur ::target-text (surbrillance + halo)
  const css =
    `::target-text{` +
    `background:#fff44b!important;` +
    `box-shadow:0 0 0 ${radius}px rgba(255,244,75,.85)!important;` +
    `border-radius:4px!important;` +
    `color:inherit!important` +
    `}`;

  const u = new URL('https://api.microlink.io/');
  u.searchParams.set('url', urlWithFragment);
  u.searchParams.set('screenshot', 'true');
  u.searchParams.set('meta', 'false');
  u.searchParams.set('embed', 'screenshot.url');
  u.searchParams.set('waitUntil', 'networkidle2');
  u.searchParams.set('viewport.width', '1280');
  u.searchParams.set('viewport.height', '720');

  // centrage sur le fragment (supporté par Microlink côté navigateur cible)
  u.searchParams.set('scrollTo', ':target-text');
  u.searchParams.set('scrollBehavior', 'center');

  // injecte la CSS de highlight
  u.searchParams.set('styles', css);

  // retourne directement une image
  u.searchParams.set('as', 'image');

  return u.toString(); // <- aucun encodeURIComponent ici !
}

async function handler(req, res) {
  if (req.method !== 'POST') {
    // petit mémo côté client
    return res
      .status(200)
      .json({ ok: true, route: 'occurrence-links', tip: 'Use POST { url, term, max?, radius? }' });
  }

  try {
    const { url, term, max = 6, radius = 6 } = req.body || {};
    if (!url || !term) {
      return res.status(400).json({ ok: false, error: 'Missing url or term' });
    }

    const origin = getOrigin(req);

    // NOTE : ici on « simule » la recherche d’occurrences en dupliquant
    // le même fragment max fois. Si tu as déjà la liste précise des fragments,
    // remplace la boucle par ta logique d’extraction.
    const count = Math.max(1, Math.min(50, Number(max) || 6));
    const items = [];

    for (let i = 0; i < count; i++) {
      const imageUrl = buildMicrolinkImageURL({
        pageUrl: url,
        term,
        radius,
      });

      const proxiedUrl = `${origin}/api/proxy-image?src=${encodeURIComponent(
        imageUrl
      )}`;

      items.push({
        index: i + 1,
        url,
        term,
        imageUrl,   // brut (debug)
        proxiedUrl, // à consommer côté Framer
        provider: 'microlink',
      });
    }

    return res.status(200).json({
      ok: true,
      count: items.length,
      term,
      url,
      items,
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || 'Server error' });
  }
}

export default withCORS(handler);

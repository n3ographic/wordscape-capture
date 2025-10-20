// api/proxy-image.js
import { withCors } from './_cors.js'; // si ton _cors expose autre chose, adapte la ligne
// Si tu n’as pas de helper CORS, enlève withCors et renvoie les en-têtes CORS ci-dessous à la main.

const ALLOW = [
  'image.thum.io',
  'api.microlink.io',
  'microlink.io',
  // CDNs Microlink les plus fréquents
  'iad.microlink.io',
  'sfo.microlink.io',
  'cdg.microlink.io',
  'ewr.microlink.io',
  'fra.microlink.io',
  // au cas où d’autres pops soient ajoutés
  '.microlink.io'
];

function isAllowed(hostname) {
  return ALLOW.some(a =>
    a.startsWith('.') ? hostname.endsWith(a) : hostname === a
  );
}

export default async function handler(req, res) {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Max-Age', '600');
    return res.status(204).end();
  }

  try {
    const raw = (req.query?.src ?? req.body?.src ?? '').toString();
    if (!raw) return bad(res, 400, 'Missing src');

    // Certaines sources arrivent déjà encodées; normalisons
    let src = raw;
    try { src = decodeURIComponent(raw); } catch (_) {} // si déjà décodé, pas grave

    let url;
    try { url = new URL(src); } catch (e) { return bad(res, 400, 'Bad src'); }

    if (!/^https?:$/.test(url.protocol)) return bad(res, 400, 'Only http(s) allowed');
    if (!isAllowed(url.hostname)) return bad(res, 400, `Host not allowed: ${url.hostname}`);

    const up = await fetch(url.toString(), {
      redirect: 'follow',
      headers: {
        // encourage le binaire
        'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        'User-Agent': 'wordscape-proxy/1.0 (+vercel)'
      }
    });

    if (!up.ok) return bad(res, up.status, `Upstream ${up.status}`);

    // On relaie le content-type si présent, sinon image/png
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
    res.setHeader('Content-Type', up.headers.get('content-type') || 'image/png');

    // Stream direct
    up.body.pipe(res);
  } catch (err) {
    return bad(res, 500, 'Proxy error');
  }
}

function bad(res, code, msg) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.status(code).end(JSON.stringify({ ok: false, error: msg }));
}

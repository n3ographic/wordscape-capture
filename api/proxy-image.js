// /api/proxy-image.js
import { withCors } from './_cors.js';
import { Readable } from 'node:stream';

const ALLOW_HOSTS = new Set([
  'api.microlink.io',
  'image.thum.io',
]);

function decodeMaybeTwice(str) {
  try {
    const once = decodeURIComponent(str);
    try {
      return decodeURIComponent(once);
    } catch {
      return once;
    }
  } catch {
    return str;
  }
}

export default withCors(async function handler(req, res) {
  try {
    const { src = '', redirect = '1' } = req.query ?? {};
    if (!src) return res.status(400).send('Missing src');

    const decoded = decodeMaybeTwice(String(src));
    let url;
    try {
      url = new URL(decoded);
    } catch (e) {
      return res.status(400).send('Invalid URL');
    }

    if (!['http:', 'https:'].includes(url.protocol)) {
      return res.status(400).send('Invalid protocol');
    }
    if (!ALLOW_HOSTS.has(url.hostname)) {
      return res.status(400).send('Host not allowed');
    }

    // cache agressif côté CDN
    res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=600');

    // chemin rapide : redirection 302 (meilleure perf)
    if (redirect === '1') {
      res.setHeader('Location', url.toString());
      return res.status(302).end();
    }

    // chemin robuste : on stream l’upstream
    const upstream = await fetch(url, { redirect: 'follow' });
    const ct = upstream.headers.get('content-type') || 'image/jpeg';
    const cl = upstream.headers.get('content-length');

    res.status(upstream.status);
    res.setHeader('Content-Type', ct);
    if (cl) res.setHeader('Content-Length', cl);

    if (!upstream.body) return res.end();
    Readable.fromWeb(upstream.body).pipe(res);
  } catch (err) {
    console.error('[proxy-image] error', err);
    res.status(500).send('Upstream error');
  }
});

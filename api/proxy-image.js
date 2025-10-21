import { withCORS } from './_cors';

async function handler(req, res) {
  try {
    const src = req.query.src;
    if (!src) return res.status(400).send('Missing src');

    // Important: ne pas re-encoder src ici (il est déjà complet).
    const upstream = await fetch(src, {
      redirect: 'follow',
      headers: {
        // user-agent « normal » pour limiter les 403 anti-bot
        'user-agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
      },
    });

    if (!upstream.ok) {
      return res
        .status(upstream.status)
        .send(`Upstream error: ${upstream.statusText}`);
    }

    const contentType =
      upstream.headers.get('content-type') || 'image/png';

    const buf = Buffer.from(await upstream.arrayBuffer());
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=120');
    res.status(200).send(buf);
  } catch (e) {
    res.status(500).send('Proxy failed');
  }
}

export default withCORS(handler);

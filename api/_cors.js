// /api/_cors.js
export function withCors(handler) {
  return async function corsWrapped(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Max-Age', '600');
    res.setHeader('Vary', 'Origin');

    if (req.method === 'OPTIONS') {
      return res.status(204).end();
    }
    try {
      return await handler(req, res);
    } catch (err) {
      console.error('[CORS handler] error:', err);
      return res
        .status(500)
        .json({ ok: false, error: 'Internal error', details: String(err?.message || err) });
    }
  };
}

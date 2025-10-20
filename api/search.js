export const config = { runtime: 'nodejs' };

const getEnv = () => {
  const CX =
    process.env.CSE_CX ||
    process.env.GOOGLE_CSE_ID ||
    process.env.SEARCH_CX ||
    '';

  const KEY =
    process.env.CSE_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.NEXT_PUBLIC_GOOGLE_API_KEY ||
    '';

  return { CX: CX?.trim(), KEY: KEY?.trim() };
};

const cors = (res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '600');
};

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  const { CX, KEY } = getEnv();
  if (!CX || !KEY) {
    return res
      .status(200)
      .json({ ok: false, error: 'CSE not configured', hasCX: !!CX, hasKEY: !!KEY });
  }

  try {
    const q = (req.query.q || '').toString();
    const num = Math.min(parseInt(req.query.num || '5', 10), 10);
    const lang = (req.query.lang || 'fr').toString();
    const site = (req.query.site || '').toString(); // ex: fr.wikipedia.org

    if (!q) return res.status(400).json({ ok: false, error: 'Missing q' });

    const params = new URLSearchParams({
      key: KEY,
      cx: CX,
      q,
      num: String(num),
      lr: lang ? `lang_${lang}` : '',
      safe: 'off',
    });

    if (site) params.set('q', `${q} site:${site}`);

    const url = `https://customsearch.googleapis.com/customsearch/v1?${params.toString()}`;
    const r = await fetch(url);
    const data = await r.json();

    if (data.error) {
      return res.status(200).json({ ok: false, error: data.error.message || 'CSE error' });
    }

    const urls =
      (data.items || [])
        .map((it) => it.link)
        .filter(Boolean);

    return res.status(200).json({ ok: true, q, count: urls.length, urls });
  } catch (e) {
    return res.status(200).json({ ok: false, error: e.message || 'Unknown error' });
  }
}

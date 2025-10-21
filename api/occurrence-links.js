// /api/occurrence-links.js
import { withCors } from './_cors.js';

/**
 * Escape RegExp special chars
 */
const escReg = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Build a Microlink screenshot URL that:
 *  - injecte du CSS (surlignage jaune)
 *  - injecte du JS (wrap <mark> autour des occurrences + centre l’occurrence ciblée)
 *  - effectue un léger zoom visuel via transform sur le <mark>
 *
 * @param {string} url  - page à capturer
 * @param {string} term - mot/terme à surligner
 * @param {number} focusIndex - index (0-based) de l’occurrence à centrer
 * @param {number} zoom - facteur de zoom visuel appliqué au <mark>
 */
function buildMicrolink(url, term, focusIndex = 0, zoom = 1.35) {
  const STYLES = `
.ws-highlight{
  background:#fff44b !important;
  box-shadow:0 0 0 6px rgba(255,244,75,.78) !important;
  border-radius:6px !important;
  padding:.05em .18em;
  display:inline-block;
  transform:scale(${zoom});
  transform-origin:center;
  color:inherit !important;
  text-shadow:none !important;
}
  `.trim();

  const SCRIPTS = `
(()=>{try{
  const term = ${JSON.stringify(term)};
  const re = new RegExp(${JSON.stringify(escReg(term))}, 'gi');

  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode(node){
        const p = node.parentElement;
        if(!p) return NodeFilter.FILTER_REJECT;
        // on évite les zones non pertinentes
        if(/^(SCRIPT|STYLE|NOSCRIPT|SVG|CANVAS|IFRAME|CODE|PRE)$/i.test(p.tagName))
          return NodeFilter.FILTER_REJECT;
        if(!node.nodeValue || !re.test(node.nodeValue))
          return NodeFilter.FILTER_SKIP;
        re.lastIndex = 0;
        return NodeFilter.FILTER_ACCEPT;
      }
    }
  );

  const candidates = [];
  while(walker.nextNode()) candidates.push(walker.currentNode);

  for(const textNode of candidates){
    const html = textNode.nodeValue.replace(re, m => '<mark class="ws-highlight">'+m+'</mark>');
    const span = document.createElement('span');
    span.innerHTML = html;
    textNode.parentNode.replaceChild(span, textNode);
  }

  const els = document.querySelectorAll('.ws-highlight');
  const idx = Math.max(0, Math.min(${Number(focusIndex)}, els.length - 1));
  const target = els[idx] || els[0];
  if(target){
    target.scrollIntoView({block:'center', inline:'center'});
  }
}catch(e){/* silent */}})();
  `.trim();

  const qs = new URLSearchParams({
    url,
    screenshot: 'true',
    meta: 'false',
    embed: 'screenshot.url',
    waitUntil: 'networkidle2',
    'viewport.width': '1280',
    'viewport.height': '720',
    styles: STYLES,
    scripts: SCRIPTS,
    as: 'image'
  });

  return `https://api.microlink.io/?${qs.toString()}`;
}

export default withCors(async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ ok: false, error: 'Use POST' });
    }

    const body = typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}');

    const pageUrl = String(body.url || '').trim();
    const term    = String(body.term || '').trim();
    const max     = Math.min(Number(body.max || 6) || 6, 20);
    const zoom    = Math.max(1, Math.min(Number(body.zoom || 1.35) || 1.35, 2));

    if (!pageUrl || !term) {
      return res.status(400).json({ ok: false, error: 'Missing `url` or `term`' });
    }

    // Valide et normalise
    const u = new URL(pageUrl);
    const normalized = u.toString();

    // Génère `max` captures en centrant l’occurrence i (0-based) à chaque fois
    const items = Array.from({ length: max }, (_, i) => {
      const imageUrl = buildMicrolink(normalized, term, i, zoom);
      return {
        index: i + 1,
        url: normalized,
        term,
        imageUrl,
        // le fallback ne surlignera pas (secours simple)
        fallbackUrl: `https://image.thum.io/get/width/1280/crop/720/noanimate/${encodeURIComponent(normalized)}`,
        focus: i,           // occurrence centrée
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
  } catch (err) {
    return res.status(200).json({
      ok: false,
      error: String(err && err.message ? err.message : err)
    });
  }
});

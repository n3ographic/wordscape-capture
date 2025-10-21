// /api/occurrence-links.js
import { withCors } from './_cors.js';

/* CSS injecté dans la page avant la capture (compact = URL plus courte) */
const HIGHLIGHT_CSS =
  'mark.__w{background:#fff44b!important;box-shadow:0 0 0 6px rgba(255,244,75,.85)!important;border-radius:6px!important;padding:0 .2em;color:inherit!important;text-shadow:none!important}';

/* Petit helper pour échapper le terme dans une RegExp côté page */
const ESC_RE =
  "function __esc(s){return s.replace(/[.*+?^${}()|[\\]\\\\]/g,'\\\\$&')}";

/* Construit l’URL Microlink qui :
   - charge la page,
   - injecte CSS + script d’annotation <mark>,
   - centre la 1re occurrence,
   - renvoie l’URL du screenshot.
*/
function buildMicrolinkUrl(pageUrl, term) {
  // Script minifié exécuté avant capture
  const script =
    `(()=>{${ESC_RE};try{var t=${JSON.stringify(term)};` +
    `var re=new RegExp(__esc(t),'gi');` +
    `var w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);` +
    `var first=null;while(w.nextNode()){var n=w.currentNode;` +
    `if(!n.nodeValue||!n.nodeValue.trim())continue;` +
    `if(!re.test(n.nodeValue))continue;` +
    `var html=n.nodeValue.replace(re,'<mark class=__w>$&</mark>');` +
    `var d=document.createElement('div');d.innerHTML=html;` +
    `var f=document.createDocumentFragment();while(d.firstChild)f.appendChild(d.firstChild);` +
    `n.parentNode.replaceChild(f,n);if(!first)first=document.querySelector('mark.__w');}` +
    `if(first)first.scrollIntoView({block:'center',inline:'nearest'});}` +
    `catch(e){}})();`;

  const qs = new URLSearchParams({
    url: pageUrl,                 // page cible
    screenshot: 'true',
    meta: 'false',
    embed: 'screenshot.url',      // on veut l’URL du screenshot
    waitUntil: 'networkidle2',
    'viewport.width': '1280',
    'viewport.height': '720',
    styles: HIGHLIGHT_CSS,
    scripts: script,
    as: 'image'
  });

  return `https://api.microlink.io/?${qs.toString()}`;
}

/* Fallback simple si Microlink échoue (pas de surlignage ici) */
function buildFallback(pageUrl) {
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

    // Normalise et valide l’URL
    const normalized = new URL(pageUrl).toString();

    // Sans crawler complet on ne calcule pas tous les offsets.
    // On renvoie `max` éléments identiques (première occurrence centrée/surlignée).
    const items = Array.from({ length: max }, (_, i) => {
      const imageUrl = buildMicrolinkUrl(normalized, term);
      return {
        index: i + 1,
        url: normalized,
        term,
        imageUrl,
        fallbackUrl: buildFallback(normalized),
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
    return res.status(200).json({ ok: false, error: String(err?.message || err) });
  }
});

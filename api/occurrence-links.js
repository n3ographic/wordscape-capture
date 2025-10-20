// api/occurrence-links.js
// POST { url, term, max?: number, wholeWord?: boolean,
//        color?: string, outline?: number, glow?: number,
//        viewportWidth?: number, viewportHeight?: number, waitFor?: number }
// -> { ok, items:[{ imageUrl, fallbackUrl, target, fragment, provider }], count }

const setCORS = (res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Max-Age", "600");
};

function fetchWithTimeout(url, options = {}, ms = 15000) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { ...options, signal: ctrl.signal }).finally(() => clearTimeout(id));
}

function htmlToText(html) {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const WORD_CHAR_RE = /[\p{L}\p{N}_]/u;
const isWordChar = (ch) => !!(ch && WORD_CHAR_RE.test(ch));

function hexToRgba(hex, a = 1) {
  let c = hex.replace("#", "").trim();
  if (c.length === 3) c = c.split("").map(x => x + x).join("");
  const n = parseInt(c, 16);
  return `rgba(${(n>>16)&255},${(n>>8)&255},${n&255},${a})`;
}

function cssStyles({ color = "#ffeb3b", outline = 6, glow = 24, scrollPad = 80 } = {}) {
  return `
    /* surlignage si :target-text marche */
    ::target-text{
      background:${color}!important;color:#111!important;border-radius:6px!important;
      padding:2px 4px!important;outline:none!important;
      box-shadow:0 0 0 ${outline}px ${hexToRgba(color,0.95)},
                 0 0 0 ${outline*2}px ${hexToRgba(color,0.35)},
                 0 0 ${glow}px ${hexToRgba("#ffc800",0.5)}!important;
      -webkit-box-decoration-break:clone;box-decoration-break:clone;
    }
    /* surlignage forcé via <mark> injecté */
    mark.wc-marker{
      background:${color}!important;color:#111!important;border-radius:6px!important;
      padding:2px 4px!important;
      box-shadow:0 0 0 ${outline}px ${hexToRgba(color,0.95)},
                 0 0 0 ${outline*2}px ${hexToRgba(color,0.35)},
                 0 0 ${glow}px ${hexToRgba("#ffc800",0.5)}!important;
      -webkit-box-decoration-break:clone;box-decoration-break:clone;
    }
    /* Wikipedia headers */
    .vector-sticky-header,#mw-head,#siteNotice{display:none!important;}
    html{scroll-padding-top:${scrollPad}px!important;}
  `.replace(/\s+/g," ");
}

function jsEscape(str="") {
  return String(str)
    .replace(/\\/g, "\\\\")
    .replace(/`/g, "\\`")
    .replace(/\${/g, "\\${");
}

function injectScript({ term, nth }) {
  // Wrap toutes les occurrences en <mark.wc-marker> puis scroll jusqu’à la nth
  const t = jsEscape(term);
  const n = Math.max(0, nth|0);
  return `
    (function(){
      try{
        var TERM="${t}";
        var re=new RegExp(TERM.replace(/[.*+?^${}()|[\\]\\\\]/g,'\\\\$&'),'gi');
        function walk(node){
          if(!node) return 0;
          if(node.nodeType===3){ // Text
            var s=node.data; if(!s||!re.test(s)) return 0;
            re.lastIndex=0;
            var frag=document.createDocumentFragment();
            var last=0, m, count=0;
            while((m=re.exec(s))){
              var before=s.slice(last,m.index);
              if(before) frag.appendChild(document.createTextNode(before));
              var mark=document.createElement('mark');
              mark.className='wc-marker';
              mark.setAttribute('data-word', m[0]);
              mark.textContent=m[0];
              frag.appendChild(mark);
              last=re.lastIndex; count++;
            }
            var after=s.slice(last); if(after) frag.appendChild(document.createTextNode(after));
            if(node.parentNode) node.parentNode.replaceChild(frag,node);
            return count;
          }
          if(node.nodeType===1){
            var tag=node.tagName;
            if(/^(SCRIPT|STYLE|NOSCRIPT|SVG|CANVAS|HEAD|IFRAME)$/.test(tag)) return 0;
            var c=0, child=node.firstChild, next;
            while(child){ next=child.nextSibling; c+=walk(child); child=next; }
            return c;
          }
          return 0;
        }
        walk(document.body);
        var marks=Array.prototype.slice.call(document.querySelectorAll('mark.wc-marker'));
        if(marks.length){
          var target=marks[Math.min(${n}, marks.length-1)];
          if(target && target.scrollIntoView){
            target.scrollIntoView({block:'center', inline:'center', behavior:'instant'});
          }
        } else {
          // fallback : focus sur le premier élément textuel significatif
          var el=document.querySelector('p,li,td,dd,article,main,section');
          if(el && el.scrollIntoView) el.scrollIntoView({block:'center',behavior:'instant'});
        }
      }catch(e){}
    })();
  `.replace(/\s+/g," ");
}

async function screenshotMicrolink(targetURL, {
  term,
  nth,
  color = "#ffeb3b",
  outline = 6,
  glow = 24,
  viewportWidth = 1280,
  viewportHeight = 720,
  waitFor = 900,
} = {}) {
  const u = new URL("https://api.microlink.io");
  u.searchParams.set("url", targetURL.toString()); // on garde aussi le fragment, si jamais il marche
  u.searchParams.set("screenshot", "true");
  u.searchParams.set("meta", "false");
  u.searchParams.set("viewport.width", String(viewportWidth));
  u.searchParams.set("viewport.height", String(viewportHeight));
  u.searchParams.set("waitForTimeout", String(waitFor));
  u.searchParams.set("styles", cssStyles({ color, outline, glow }));
  u.searchParams.set("scripts", injectScript({ term, nth }));

  const r = await fetchWithTimeout(u.toString(), {}, 15000);
  if (!r.ok) throw new Error(`Microlink ${r.status}`);
  const j = await r.json();
  const url = j?.data?.screenshot?.url;
  if (!url) throw new Error("Microlink: no screenshot.url");
  return url;
}

export default async function handler(req, res) {
  setCORS(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "POST only" });

  try {
    const {
      url,
      term,
      max = 8,
      wholeWord = true,
      color = "#ffeb3b",
      outline = 6,
      glow = 24,
      viewportWidth = 1280,
      viewportHeight = 720,
      waitFor = 900,
    } = req.body || {};

    if (!url || !term) return res.status(400).json({ ok: false, error: "Missing url or term" });

    // 1) récupère la page, extrait le texte
    const page = await fetchWithTimeout(url, {}, 12000);
    if (!page.ok) return res.status(502).json({ ok: false, error: `Fetch failed: ${page.status}` });
    const html = await page.text();
    const text = htmlToText(html);
    if (!text) return res.json({ ok: true, items: [], count: 0 });

    // 2) trouve toutes les occurrences (insensible à la casse)
    const lower = text.toLocaleLowerCase();
    const needle = String(term).toLocaleLowerCase();
    const cap = Math.max(1, Math.min(parseInt(max, 10) || 8, 20));

    const positions = [];
    let from = 0;
    while (positions.length < cap) {
      const i = lower.indexOf(needle, from);
      if (i === -1) break;
      const start = i;
      const end = i + needle.length;

      if (wholeWord) {
        const before = text[start - 1] || "";
        const after  = text[end] || "";
        const ok = !isWordChar(before) && !isWordChar(after);
        if (!ok) { from = i + needle.length; continue; }
      }

      positions.push({ start, end });
      from = i + needle.length;
    }

    if (!positions.length) return res.json({ ok: true, items: [], count: 0 });

    // 3) pour chaque occurrence : fragment (si jamais supporté) + injection JS + capture
    const ctx = 30;
    const items = [];
    let occIndex = 0;
    for (const { start, end } of positions) {
      const before = text.slice(Math.max(0, start - ctx), start).trim();
      const match  = text.slice(start, end);
      const after  = text.slice(end, Math.min(text.length, end + ctx)).trim();

      // fragment "idéal" (si le site et le rendu le respectent)
      const frag = `:~:text=${encodeURIComponent(before)}-,${encodeURIComponent(match)},-${encodeURIComponent(after)}`;
      const target = new URL(url);
      target.hash = frag;

      let imageUrl = "";
      try {
        imageUrl = await screenshotMicrolink(target, {
          term, nth: occIndex,
          color, outline, glow,
          viewportWidth, viewportHeight, waitFor
        });
      } catch {
        // on basculera sur fallback côté client
      }

      const safe = target.toString().replace(/#/g, "%23");
      const fallbackUrl = `https://image.thum.io/get/width/1280/crop/720/noanimate/${safe}`;

      items.push({
        imageUrl,
        fallbackUrl,
        target: target.toString(),
        fragment: frag,
        provider: imageUrl ? "microlink" : "thum.io",
      });

      occIndex++;
    }

    res.json({ ok: true, items, count: items.length });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}

// api/_microlink.js
//
// Construit une URL Microlink qui :
//  - injecte CSS (jaune)
//  - entoure la n-ième occurrence avec <mark.ws-highlight>
//  - scrolle pour centrer verticalement la cible
//
export function microlinkShotUrl(targetUrl, term, occurrenceIndex = 1) {
  const styles = `
    html,body{scroll-behavior:auto!important}
    .ws-highlight{
      background:#ffeb3b !important;
      color:#111 !important;
      padding:0 .06em;
      border-radius:.12em;
      box-shadow:0 0 0 2px rgba(255,235,59,.8);
    }
  `;

  // Script court, occupe peu d'octets pour ne pas dépasser la longueur d'URL
  const script = `
  (function(){
    var term=${JSON.stringify(term||"")};
    var nth=${Number(occurrenceIndex)||1};
    if(!term) return;

    var walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT,{
      acceptNode:function(n){
        if(!n.nodeValue||!n.nodeValue.trim())return NodeFilter.FILTER_REJECT;
        var p=n.parentElement;if(!p)return NodeFilter.FILTER_REJECT;
        var t=p.tagName; if(/SCRIPT|STYLE|NOSCRIPT|IFRAME|TEXTAREA/.test(t))return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });

    var count=0, found=null;
    while(walker.nextNode()){
      var node=walker.currentNode, txt=node.nodeValue, low=txt.toLowerCase(), seek=term.toLowerCase();
      var i=low.indexOf(seek);
      if(i>=0){
        count++;
        if(count===nth){
          var r=document.createRange();
          r.setStart(node,i); r.setEnd(node,i+term.length);
          var mark=document.createElement('mark'); mark.className='ws-highlight';
          r.surroundContents(mark); found=mark; break;
        }
      }
    }
    var el=found||document.querySelector('.ws-highlight');
    if(el){
      var rect=el.getBoundingClientRect();
      var y=window.scrollY+rect.top-(window.innerHeight/2-rect.height/2);
      window.scrollTo(0,Math.max(0,y));
    }
  })();`;

  const u = new URL("https://api.microlink.io/");
  u.searchParams.set("url", targetUrl);
  u.searchParams.set("screenshot", "true");
  u.searchParams.set("meta", "false");
  u.searchParams.set("embed", "screenshot.url");
  u.searchParams.set("waitUntil", "networkidle2");
  u.searchParams.set("viewport.width", "1280");
  u.searchParams.set("viewport.height", "720");
  // Injection
  u.searchParams.set("styles", styles);
  u.searchParams.set("script", script);

  return u.toString();
}

// Optionnel : fallback thum.io (si tu veux garder un plan B)
export function thumioShotUrl(targetUrl, term) {
  // text fragment (au cas où), crop vertical raisonnable
  const frag = `#:~:text=${encodeURIComponent(term)}`;
  return `https://image.thum.io/get/width/1280/crop/720/noanimate/${encodeURIComponent(
    targetUrl + frag
  )}`;
}

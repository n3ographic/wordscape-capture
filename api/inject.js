// /api/inject.js
export default function handler(req, res) {
  const q = req.query || {};
  const term = Array.isArray(q.term) ? q.term[0] : (q.term || '');
  const safe = JSON.stringify(term);

  const js =
    `(()=>{function esc(s){return s.replace(/[.*+?^${}()|[\\]\\\\]/g,'\\\\$&')}
try{
  var re=new RegExp(esc(${safe}),'gi');
  var w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
  var first=null;
  while(w.nextNode()){
    var n=w.currentNode;
    if(!n.nodeValue||!n.nodeValue.trim()) continue;
    if(!re.test(n.nodeValue)) continue;
    var html=n.nodeValue.replace(re,'<mark class="__w">$&</mark>');
    var d=document.createElement('div');d.innerHTML=html;
    var f=document.createDocumentFragment();
    while(d.firstChild) f.appendChild(d.firstChild);
    n.parentNode.replaceChild(f,n);
    if(!first) first=document.querySelector('mark.__w');
  }
  if(first) first.scrollIntoView({block:"center",inline:"nearest"});
}catch(e){} })();`;

  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  res.status(200).send(js);
}

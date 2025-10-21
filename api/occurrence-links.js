// api/occurrence-links.js
export const config = { runtime: "edge" };

const YELLOW_CSS = `
  ::target-text{
    background:#fff44b !important;
    box-shadow:0 0 0 6px rgba(255,244,75,.85) !important;
    border-radius:6px !important;
    color:inherit !important;
    text-shadow:none !important;
  }
`;

function corsJSON(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "content-type",
      "cache-control": "public, max-age=0, must-revalidate",
    },
  });
}

export default async function handler(req) {
  if (req.method === "OPTIONS") return corsJSON("", 204);
  if (req.method !== "POST") {
    return corsJSON({ ok: false, error: "method not allowed" }, 405);
  }

  let body = {};
  try { body = await req.json(); } catch {}
  const { url, term, max = 6 } = body;

  if (!url || !term) {
    return corsJSON({ ok: false, error: "missing url or term" }, 400);
  }

  // On utilise :target-text pour chaque occurrence; on limite à "max"
  const encodedFragment = (before, target, after) =>
    `:~:text=${encodeURIComponent(before)}-,${encodeURIComponent(target)},-${encodeURIComponent(after)}`;

  // Approche simple : on laisse Microlink scroller vers :target-text au centre
  // et on surcharge le style pour le surlignage.
  const buildImageUrl = (targetUrl) =>
    `https://api.microlink.io/?url=${encodeURIComponent(targetUrl)}\
&screenshot=true&meta=false&embed=screenshot.url\
&waitUntil=networkidle2&viewport.width=1280&viewport.height=720\
&scrollTo=%3Atarget-text&scrollBehavior=center\
&styles=${encodeURIComponent(YELLOW_CSS)}&as=image`;

  // On s'appuie ici sur le surlignage natif de Chrome/Wikipedia,
  // on génère jusqu'à "max" variantes de fragments.
  // NB: pour un découpage "before/after" plus fin, tu peux parser le HTML côté serveur.
  const items = [];
  for (let i = 1; i <= max; i++) {
    const frag = `:~:text=${encodeURIComponent(term)}`;
    const targetUrl = url.includes("#")
      ? url + encodeURIComponent(` ${frag}`)
      : `${url}#${frag}`;

    items.push({
      index: i,
      url: targetUrl,
      term,
      imageUrl: buildImageUrl(targetUrl),
      fallbackUrl: `https://image.thum.io/get/width/1280/crop/720/noanimate/${encodeURIComponent(
        targetUrl
      )}`,
      fragment: frag,
      provider: "microlink",
    });
  }

  return corsJSON({ ok: true, count: items.length, term, url, items });
}

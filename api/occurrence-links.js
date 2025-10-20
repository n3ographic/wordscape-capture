// api/occurrence-links.js
export const config = { runtime: "edge" };

const VIEW_W = 1280;
const VIEW_H = 720;
const HILITE_CSS = `
  ::target-text{
    background: #fff44b !important;
    box-shadow: 0 0 0 6px rgba(255,244,75,.85) !important;
    border-radius: 4px !important;
    color: inherit !important;
  }
`;

function buildTextFragment(term) {
  return `#:~:text=${encodeURIComponent(term)}`;
}

function microlinkShot(pageUrlWithFragment) {
  const u = new URL("https://api.microlink.io/");
  u.searchParams.set("url", pageUrlWithFragment);
  u.searchParams.set("screenshot", "true");
  u.searchParams.set("meta", "false");
  u.searchParams.set("embed", "screenshot.url");
  u.searchParams.set("waitUntil", "networkidle2");
  u.searchParams.set("viewport.width", String(VIEW_W));
  u.searchParams.set("viewport.height", String(VIEW_H));
  u.searchParams.set("scrollTo", ":target-text");
  u.searchParams.set("scrollBehavior", "center");
  u.searchParams.set("styles", HILITE_CSS);
  u.searchParams.set("as", "image");
  return u.toString();
}

export default async function handler(req) {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET,POST,OPTIONS",
        "access-control-allow-headers": "Content-Type, Authorization",
        "access-control-max-age": "600",
      },
    });
  }

  const { url, term, max = 6 } = await req.json().catch(() => ({}));
  if (!url || !term) {
    return new Response(JSON.stringify({ ok: false, error: "Missing { url, term }" }), {
      status: 400,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "access-control-allow-origin": "*",
      },
    });
  }

  // Ici j’illustre en construisant N fois la même cible avec fragment.
  // Si tu as déjà un tableau d’occurrences (index, before, after…),
  // remplace simplement la construction de `withFragment`.
  const items = Array.from({ length: Math.max(1, Math.min(50, max)) }).map((_, i) => {
    const withFragment = url + buildTextFragment(term);
    return {
      index: i + 1,
      url,
      term,
      imageUrl: microlinkShot(withFragment),
      provider: "microlink",
      target: withFragment,
    };
  });

  return new Response(JSON.stringify({ ok: true, count: items.length, items }), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
    },
  });
}

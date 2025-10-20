// api/capture-link.js
export const config = { runtime: "edge" };

const VIEW_W = 1280;
const VIEW_H = 720;

// jaune pétant + petit halo
const HILITE_CSS = `
  ::target-text{
    background: #fff44b !important;
    box-shadow: 0 0 0 6px rgba(255,244,75,.85) !important;
    border-radius: 4px !important;
    color: inherit !important;
  }
`;

function buildTextFragment(term) {
  // basique: cible uniquement le mot (ça marche bien sur Wikipédia)
  // si tu veux désambiguïser, tu peux construire "prefix-,term,-suffix"
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
  // essaie de centrer l’élément ciblé par le fragment
  u.searchParams.set("scrollTo", ":target-text");
  u.searchParams.set("scrollBehavior", "center");
  // renforce la couleur de highlight
  u.searchParams.set("styles", HILITE_CSS);
  // force un rendu image (au cas où)
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

  const { url, term } = await req.json().catch(() => ({}));

  if (!url || !term) {
    return new Response(
      JSON.stringify({ ok: false, error: "Missing { url, term }" }),
      {
        status: 400,
        headers: {
          "content-type": "application/json; charset=utf-8",
          "access-control-allow-origin": "*",
        },
      }
    );
  }

  const withFragment = url + buildTextFragment(term);
  const shotUrl = microlinkShot(withFragment);

  return new Response(
    JSON.stringify({
      ok: true,
      imageUrl: shotUrl,          // tu continues à passer par /api/proxy-image côté Framer
      provider: "microlink",
      target: withFragment,
    }),
    {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "access-control-allow-origin": "*",
      },
    }
  );
}

// api/proxy-image.js
export const config = { runtime: "edge" };

function withCORS(res, status = 200, extra = {}) {
  const headers = new Headers({
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type",
    ...extra,
  });
  return new Response(res.body ?? res, { status, headers });
}

export default async function handler(req) {
  if (req.method === "OPTIONS") {
    return withCORS("", 204);
  }

  const { searchParams } = new URL(req.url);
  let src = searchParams.get("src") || "";

  if (!src) {
    return withCORS(
      new Response(JSON.stringify({ ok: false, error: "missing src" }), {
        headers: { "content-type": "application/json; charset=utf-8" },
      }),
      400
    );
  }

  // On normalise: 1x decode, puis on valide que c'est bien http(s)
  try { src = decodeURIComponent(src); } catch {}
  let u;
  try {
    u = new URL(src);
    if (!/^https?:$/.test(u.protocol)) throw new Error("invalid protocol");
  } catch (e) {
    return withCORS(
      new Response(JSON.stringify({ ok: false, error: "invalid url" }), {
        headers: { "content-type": "application/json; charset=utf-8" },
      }),
      400
    );
  }

  try {
    const res = await fetch(u.toString(), {
      redirect: "follow",
      headers: {
        // Forcer une récup d'image auprès de Microlink
        "user-agent":
          "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
        accept:
          "image/avif,image/webp,image/png,image/*;q=0.8,*/*;q=0.5",
      },
    });

    const ct = res.headers.get("content-type") || "";

    // Si l'upstream répond une erreur, on la propage en clair pour debug
    if (!res.ok) {
      const text = await res.text();
      return withCORS(
        new Response(text, {
          status: res.status,
          headers: { "content-type": "text/plain; charset=utf-8" },
        }),
        res.status
      );
    }

    // Si on n'a pas une image (Microlink peut renvoyer du JSON), on tente d'extraire l'URL d'image
    if (!ct.startsWith("image/")) {
      let data = null;
      try { data = await res.json(); } catch {}
      const screenshot =
        data?.data?.screenshot?.url || data?.screenshot?.url || data?.data?.url;

      if (screenshot) {
        // Rediriger directement vers l'image
        return Response.redirect(screenshot, 302);
      }

      return withCORS(
        new Response(
          JSON.stringify({ ok: false, error: "upstream-not-image", ct }),
          { headers: { "content-type": "application/json" } }
        ),
        502
      );
    }

    // Retourner le flux image tel quel
    return new Response(res.body, {
      status: 200,
      headers: {
        "access-control-allow-origin": "*",
        "content-type": ct,
        "cache-control":
          "public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400",
      },
    });
  } catch (e) {
    return withCORS(
      new Response(JSON.stringify({ ok: false, error: String(e) }), {
        headers: { "content-type": "application/json; charset=utf-8" },
      }),
      500
    );
  }
}

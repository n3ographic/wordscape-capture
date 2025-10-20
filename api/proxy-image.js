// api/proxy-image.js
export const config = { runtime: "edge" };

function tryDecode(s) {
  try { return decodeURIComponent(s); } catch { return s; }
}

export default async function handler(req) {
  const { searchParams } = new URL(req.url);
  let src = searchParams.get("src") || "";
  if (!src) {
    return new Response("Missing src", {
      status: 400,
      headers: { "access-control-allow-origin": "*" },
    });
  }

  // Decode once, then decode again if we still see %25xx (double-encoded)
  src = tryDecode(src);
  if (/%25[0-9A-Fa-f]{2}/.test(src)) src = tryDecode(src);

  let upstreamUrl;
  try {
    const u = new URL(src);

    // Microlink: be sure we really get an image
    if (u.hostname.endsWith("microlink.io") && !u.searchParams.get("as")) {
      u.searchParams.set("as", "image");
    }
    upstreamUrl = u.toString();
  } catch {
    return new Response("Bad src URL", {
      status: 400,
      headers: { "access-control-allow-origin": "*" },
    });
  }

  try {
    const resp = await fetch(upstreamUrl, {
      redirect: "follow",
      headers: {
        // some CDNs want a UA
        "user-agent": "Mozilla/5.0 (compatible; Wordscape/1.0)",
      },
    });

    if (!resp.ok) {
      const msg = await resp.text().catch(() => "");
      return new Response(`Upstream ${resp.status}\n${msg}`, {
        status: 502,
        headers: { "access-control-allow-origin": "*" },
      });
    }

    const headers = new Headers({
      "access-control-allow-origin": "*",
      "cache-control": "public, s-maxage=86400, stale-while-revalidate=604800",
      "content-type": resp.headers.get("content-type") || "image/png",
    });

    return new Response(resp.body, { status: 200, headers });
  } catch (err) {
    return new Response("Fetch error", {
      status: 502,
      headers: { "access-control-allow-origin": "*" },
    });
  }
}

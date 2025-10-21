// api/_cors.js
export function withCORS(handler) {
  return async (req, res) => {
    // Autoriser toutes origines (tu peux restreindre à ton domaine framer si besoin)
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Vary", "Origin");

    // Méthodes autorisées
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");

    // Reprendre exactement les en-têtes demandés par le préflight
    const acrh = req.headers["access-control-request-headers"];
    res.setHeader(
      "Access-Control-Allow-Headers",
      acrh ? acrh : "Content-Type, Authorization"
    );

    // Cache du préflight
    res.setHeader("Access-Control-Max-Age", "600");

    // Répondre OK au préflight
    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }

    try {
      await handler(req, res);
    } catch (err) {
      console.error("[API ERROR]", err);
      if (!res.headersSent) {
        res.status(500).json({ ok: false, error: "server_error" });
      }
    }
  };
}

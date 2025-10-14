// api/ping.js
export const config = { runtime: "nodejs20.x" };
export default (req, res) => res.status(200).json({ ok: true });

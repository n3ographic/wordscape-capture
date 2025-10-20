import { setCORS, okOptions } from "./_cors.js";
export default function handler(req, res) {
  if (okOptions(req, res)) return;
  setCORS(res);
  res.status(200).json({ ok: true, time: new Date().toISOString() });
}

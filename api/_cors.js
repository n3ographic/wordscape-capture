export const setCORS = (res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Max-Age", "600");
};
export const okOptions = (req, res) => {
  if (req.method === "OPTIONS") {
    setCORS(res);
    res.status(204).end();
    return true;
  }
  return false;
};

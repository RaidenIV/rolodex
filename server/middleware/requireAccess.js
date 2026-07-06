function requireAccess(req, res, next) {
  const expectedToken = String(process.env.ADMIN_TOKEN || "").trim();

  if (!expectedToken) return next();

  const authHeader = String(req.headers.authorization || "");
  const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  const headerToken = String(req.headers["x-admin-token"] || "").trim();
  const suppliedToken = headerToken || bearerToken;

  if (suppliedToken && suppliedToken === expectedToken) return next();

  return res.status(401).json({
    error: "Access token required",
    tokenRequired: true
  });
}

module.exports = requireAccess;

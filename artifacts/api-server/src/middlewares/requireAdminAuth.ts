import { type Request, type Response, type NextFunction } from "express";
import { validateAdminToken, isTokenRevoked } from "../lib/adminAuth";

export function requireAdminAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Admin authentication required" });
    return;
  }
  const token = authHeader.slice(7);

  if (isTokenRevoked(token)) {
    res.status(401).json({ error: "Session has been revoked" });
    return;
  }

  const result = validateAdminToken(token);
  if (!result.valid) {
    const status = result.expired ? 401 : 401;
    res.status(status).json({
      error: result.expired ? "Session expired — please log in again" : "Invalid admin token",
      expired: !!result.expired,
    });
    return;
  }

  // Attach payload to request for downstream use
  (req as Request & { adminPayload?: unknown }).adminPayload = result.payload;
  next();
}

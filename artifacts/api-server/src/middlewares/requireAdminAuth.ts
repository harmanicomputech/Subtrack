import { type Request, type Response, type NextFunction } from "express";
import { isValidAdminToken } from "../lib/adminAuth";

export function requireAdminAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Admin authentication required" });
    return;
  }
  const token = authHeader.slice(7);
  if (!isValidAdminToken(token)) {
    res.status(401).json({ error: "Invalid or expired admin token" });
    return;
  }
  next();
}

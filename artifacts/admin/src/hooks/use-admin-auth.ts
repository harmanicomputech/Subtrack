import { useState, useEffect, useCallback, useRef } from "react";
import {
  adminMe,
  adminLogout,
  adminRefreshSession,
  getAdminToken,
  getAdminSession,
  setAdminSession,
  clearAdminToken,
  isSessionExpired,
  isSessionNearExpiry,
  SessionExpiredError,
} from "@/lib/admin-api";

const INACTIVITY_LIMIT_MS = 15 * 60 * 1000; // 15 minutes
const ACTIVITY_CHECK_INTERVAL_MS = 30_000;   // check every 30 s

export type LogoutReason = "user" | "expired" | "inactive";

export interface AdminAuthState {
  isAuthenticated: boolean | null;
  isLoading: boolean;
  login: (token: string, expiresAt: number) => Promise<void>;
  logout: (reason?: LogoutReason) => Promise<void>;
}

export function useAdminAuth(): AdminAuthState {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const lastActivityRef = useRef<number>(Date.now());
  const inactivityTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Track user activity ───────────────────────────────────────────────────
  useEffect(() => {
    const touch = () => { lastActivityRef.current = Date.now(); };
    const events = ["mousemove", "keydown", "click", "scroll", "touchstart"];
    events.forEach((e) => window.addEventListener(e, touch, { passive: true }));
    return () => events.forEach((e) => window.removeEventListener(e, touch));
  }, []);

  const doLogout = useCallback(async (reason: LogoutReason = "user") => {
    if (inactivityTimerRef.current) clearInterval(inactivityTimerRef.current);
    try { await adminLogout(); } catch { /* ignore */ }
    clearAdminToken();
    setIsAuthenticated(false);
    // Surface reason via sessionStorage so Login page can show a message
    if (reason !== "user") sessionStorage.setItem("admin_logout_reason", reason);
  }, []);

  // ── Inactivity + expiry watcher ───────────────────────────────────────────
  const startWatcher = useCallback(() => {
    if (inactivityTimerRef.current) clearInterval(inactivityTimerRef.current);
    inactivityTimerRef.current = setInterval(async () => {
      // Inactivity check
      if (Date.now() - lastActivityRef.current > INACTIVITY_LIMIT_MS) {
        await doLogout("inactive");
        return;
      }
      // Session expiry check
      if (isSessionExpired()) {
        await doLogout("expired");
        return;
      }
      // Auto-refresh if near expiry and user is active
      if (isSessionNearExpiry()) {
        try {
          const { token, expiresAt } = await adminRefreshSession();
          setAdminSession(token, expiresAt);
        } catch {
          // If refresh fails, let the next expiry check catch it
        }
      }
    }, ACTIVITY_CHECK_INTERVAL_MS);
  }, [doLogout]);

  // ── On mount: validate existing session ──────────────────────────────────
  useEffect(() => {
    const token = getAdminToken();
    if (!token || isSessionExpired()) {
      clearAdminToken();
      setIsAuthenticated(false);
      setIsLoading(false);
      return;
    }
    adminMe()
      .then((me) => {
        // If server returned updated expiry, refresh stored session
        if (me.expiresAt) {
          const session = getAdminSession();
          if (session) setAdminSession(session.token, me.expiresAt * 1); // already ms
        }
        setIsAuthenticated(true);
        startWatcher();
      })
      .catch((err) => {
        clearAdminToken();
        setIsAuthenticated(false);
        if (err instanceof SessionExpiredError) {
          sessionStorage.setItem("admin_logout_reason", "expired");
        }
      })
      .finally(() => setIsLoading(false));

    return () => {
      if (inactivityTimerRef.current) clearInterval(inactivityTimerRef.current);
    };
  }, [startWatcher]);

  // ── Login ─────────────────────────────────────────────────────────────────
  const login = useCallback(async (token: string, expiresAt: number) => {
    setAdminSession(token, expiresAt);
    sessionStorage.removeItem("admin_logout_reason");
    setIsAuthenticated(true);
    startWatcher();
  }, [startWatcher]);

  // ── Logout ────────────────────────────────────────────────────────────────
  const logout = useCallback(async (reason: LogoutReason = "user") => {
    await doLogout(reason);
  }, [doLogout]);

  return { isAuthenticated, isLoading, login, logout };
}

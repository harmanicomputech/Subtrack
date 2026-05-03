import { useState, useEffect, useCallback } from "react";
import { adminMe, adminLogout, getAdminToken, setAdminToken, clearAdminToken } from "@/lib/admin-api";

export interface AdminAuthState {
  isAuthenticated: boolean | null;
  isLoading: boolean;
  login: (token: string) => Promise<void>;
  logout: () => Promise<void>;
}

export function useAdminAuth(): AdminAuthState {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const token = getAdminToken();
    if (!token) {
      setIsAuthenticated(false);
      setIsLoading(false);
      return;
    }
    adminMe()
      .then(() => setIsAuthenticated(true))
      .catch(() => {
        clearAdminToken();
        setIsAuthenticated(false);
      })
      .finally(() => setIsLoading(false));
  }, []);

  const login = useCallback(async (token: string) => {
    setAdminToken(token);
    setIsAuthenticated(true);
  }, []);

  const logout = useCallback(async () => {
    try { await adminLogout(); } catch { /* ignore */ }
    clearAdminToken();
    setIsAuthenticated(false);
  }, []);

  return { isAuthenticated, isLoading, login, logout };
}

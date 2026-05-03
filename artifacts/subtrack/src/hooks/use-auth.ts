import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { setAuthTokenGetter, useLogout } from "@workspace/api-client-react";

setAuthTokenGetter(() => localStorage.getItem("subtrack_token"));

export function useAuth() {
  const [token, setToken] = useState<string | null>(localStorage.getItem("subtrack_token"));
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const logoutMutation = useLogout();

  useEffect(() => {
    const handleStorageChange = () => {
      setToken(localStorage.getItem("subtrack_token"));
    };
    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, []);

  const login = (newToken: string) => {
    localStorage.setItem("subtrack_token", newToken);
    setToken(newToken);
    window.dispatchEvent(new Event("storage"));
  };

  const logout = () => {
    logoutMutation.mutate(undefined);
    localStorage.removeItem("subtrack_token");
    setToken(null);
    queryClient.clear();
    window.dispatchEvent(new Event("storage"));
    setLocation("/login");
  };

  return { token, login, logout, isAuthenticated: !!token };
}

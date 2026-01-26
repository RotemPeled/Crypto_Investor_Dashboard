import React, { createContext, useContext, useMemo, useState } from "react";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem("access_token"));

  const isAuthenticated = !!token;

  function setSession(accessToken) {
    setToken(accessToken);
    localStorage.setItem("access_token", accessToken);
  }

  function logout() {
    setToken(null);
    localStorage.removeItem("access_token");
  }

  const value = useMemo(() => ({ token, isAuthenticated, setSession, logout }), [token, isAuthenticated]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

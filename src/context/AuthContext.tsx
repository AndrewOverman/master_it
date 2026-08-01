import React, { createContext, useContext, useEffect, useState } from 'react';
import { logout as logoutRequest } from '../api/auth';
import { getToken, setToken, deleteToken } from '../utils/tokenStorage';

interface AuthContextValue {
  // null while the initial SecureStore check is still pending
  isAuthenticated: boolean | null;
  signIn: (token: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

  useEffect(() => {
    getToken()
      .then((token) => setIsAuthenticated(!!token))
      .catch(() => setIsAuthenticated(false));
  }, []);

  const signIn = async (token: string) => {
    await setToken(token);
    setIsAuthenticated(true);
  };

  const signOut = async () => {
    try {
      await logoutRequest();
    } catch {
      // best-effort — still clear the local token even if the request fails
    }
    await deleteToken();
    setIsAuthenticated(false);
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

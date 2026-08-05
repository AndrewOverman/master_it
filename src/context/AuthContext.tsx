import React, { createContext, useContext, useEffect, useState } from 'react';
import { logout as logoutRequest } from '../api/auth';
import { setSessionExpiredListener } from '../api/sessionEvents';
import { getToken, setToken, deleteToken } from '../utils/tokenStorage';

interface AuthContextValue {
  // null while the initial SecureStore check is still pending
  isAuthenticated: boolean | null;
  // True when the last sign-out was forced by a 401 rather than a
  // deliberate log out — LoginScreen reads this to show a short explanation
  // instead of silently dropping the user back on the form.
  sessionExpired: boolean;
  signIn: (token: string) => Promise<void>;
  signOut: () => Promise<void>;
  clearSessionExpired: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);

  useEffect(() => {
    getToken()
      .then((token) => setIsAuthenticated(!!token))
      .catch(() => setIsAuthenticated(false));
  }, []);

  // Registered once so the axios interceptor (outside the React tree) can
  // force a sign-out on 401.
  useEffect(() => {
    setSessionExpiredListener(() => {
      deleteToken();
      setSessionExpired(true);
      setIsAuthenticated(false);
    });
    return () => setSessionExpiredListener(null);
  }, []);

  const signIn = async (token: string) => {
    await setToken(token);
    setSessionExpired(false);
    setIsAuthenticated(true);
  };

  const signOut = async () => {
    try {
      await logoutRequest();
    } catch {
      // best-effort — still clear the local token even if the request fails
    }
    await deleteToken();
    // A deliberate log out is never a "session expired" — even if the
    // logout request itself 401'd (token already invalid server-side) and
    // the interceptor above fired first, this has the final word.
    setSessionExpired(false);
    setIsAuthenticated(false);
  };

  const clearSessionExpired = () => setSessionExpired(false);

  return (
    <AuthContext.Provider
      value={{ isAuthenticated, sessionExpired, signIn, signOut, clearSessionExpired }}
    >
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

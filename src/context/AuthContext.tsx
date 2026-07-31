import React, { createContext, useContext, useEffect, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import { logout as logoutRequest } from '../api/auth';

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
    // expo-secure-store has no web implementation (getItemAsync rejects
    // there); treat "can't read a token" the same as "no token."
    SecureStore.getItemAsync('auth_token')
      .then((token) => setIsAuthenticated(!!token))
      .catch(() => setIsAuthenticated(false));
  }, []);

  const signIn = async (token: string) => {
    await SecureStore.setItemAsync('auth_token', token);
    setIsAuthenticated(true);
  };

  const signOut = async () => {
    try {
      await logoutRequest();
    } catch {
      // best-effort — still clear the local token even if the request fails
    }
    await SecureStore.deleteItemAsync('auth_token');
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

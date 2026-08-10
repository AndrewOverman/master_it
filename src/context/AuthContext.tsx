import React, { createContext, useContext, useEffect, useState } from 'react';
import { getCurrentUser, logout as logoutRequest } from '../api/auth';
import { setSessionExpiredListener } from '../api/sessionEvents';
import {
  getToken,
  setToken,
  deleteToken,
  getStoredUserId,
  setStoredUserId,
  deleteStoredUserId,
} from '../utils/tokenStorage';
import { identifyPurchasesUser, resetPurchasesUser } from '../lib/purchases';
import { identifyAnalyticsUser, resetAnalyticsUser } from '../lib/analytics';
import { identifyErrorReportingUser, resetErrorReportingUser } from '../lib/errorReporting';
import { clearPushToken, registerIfAlreadyPermitted } from '../lib/pushNotifications';

interface AuthContextValue {
  // null while the initial SecureStore check is still pending
  isAuthenticated: boolean | null;
  // True when the last sign-out was forced by a 401 rather than a
  // deliberate log out — LoginScreen reads this to show a short explanation
  // instead of silently dropping the user back on the form.
  sessionExpired: boolean;
  // `userId` is required because it's what gets handed to RevenueCat as the
  // app_user_id — see identifyPurchasesUser(). The login/register responses
  // already carry it; it used to be discarded here.
  signIn: (token: string, userId: number) => Promise<void>;
  signOut: () => Promise<void>;
  // Drops the local session without calling POST /logout. For when the account
  // itself is gone — the token has already been revoked server-side, so the
  // logout request could only 401.
  clearSession: () => Promise<void>;
  clearSessionExpired: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// Everything torn down locally when a session ends, however it ended. The
// RevenueCat reset belongs here rather than only in signOut(): whoever signs
// in next on this device must not inherit the previous account's
// entitlements, and that's just as true after a 401 as after a deliberate
// log out.
async function clearLocalSession(): Promise<void> {
  // Before deleteToken(), not after: unregistering is an authenticated
  // request, so clearing the bearer first would leave this device
  // registered and the account still receiving notifications on a phone
  // nobody is signed into. Best-effort — see clearPushToken().
  await clearPushToken();

  await deleteToken();
  await deleteStoredUserId();
  await resetPurchasesUser();
  // Same reasoning as the RevenueCat reset above, applied to the other two
  // identities: whoever signs in next on this device must not inherit the
  // previous account's events or have their crashes attributed to them.
  resetAnalyticsUser();
  resetErrorReportingUser();
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);

  // Restoring a session also has to re-identify the user to RevenueCat, or a
  // returning user is anonymous to it until they next sign in — and a
  // purchase made in that window would be attributed to an anonymous ID the
  // webhook can't resolve back to an account.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const token = await getToken();
        if (cancelled) return;
        setIsAuthenticated(!!token);
        if (!token) return;

        // Sessions that predate this ID being persisted have a token but no
        // stored ID. Fetching it once heals them in place — otherwise that
        // whole cohort stays anonymous to RevenueCat until they sign out and
        // back in, which nobody has a reason to do.
        let userId = await getStoredUserId();
        if (userId === null) {
          userId = (await getCurrentUser()).id;
          await setStoredUserId(userId);
        }
        if (cancelled) return;

        identifyAnalyticsUser(userId);
        identifyErrorReportingUser(userId);
        await identifyPurchasesUser(userId);

        // Re-registers a device that already has permission, so a rotated
        // token or a timezone change (someone who travelled) is picked up.
        // Never prompts — see registerIfAlreadyPermitted().
        registerIfAlreadyPermitted();
      } catch {
        // A failure to restore the RevenueCat identity must not cost the user
        // their session — the token is what authenticates them. The paywall
        // identifies again before purchasing.
        if (!cancelled) setIsAuthenticated((current) => current ?? false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Registered once so the axios interceptor (outside the React tree) can
  // force a sign-out on 401.
  useEffect(() => {
    setSessionExpiredListener(() => {
      clearLocalSession();
      setSessionExpired(true);
      setIsAuthenticated(false);
    });
    return () => setSessionExpiredListener(null);
  }, []);

  const signIn = async (token: string, userId: number) => {
    await setToken(token);
    await setStoredUserId(userId);
    setSessionExpired(false);
    setIsAuthenticated(true);
    identifyAnalyticsUser(userId);
    identifyErrorReportingUser(userId);
    // After the session is live, not before: identifying is a network call to
    // RevenueCat, and it failing (offline, misconfigured keys) must not turn
    // a successful login into a failed one.
    await identifyPurchasesUser(userId).catch(() => {});

    // Binds this device to the account that just signed in. Same reasoning
    // as above: not awaited into the sign-in result.
    registerIfAlreadyPermitted();
  };

  const signOut = async () => {
    try {
      await logoutRequest();
    } catch {
      // best-effort — still clear the local token even if the request fails
    }
    await clearLocalSession();
    // A deliberate log out is never a "session expired" — even if the
    // logout request itself 401'd (token already invalid server-side) and
    // the interceptor above fired first, this has the final word.
    setSessionExpired(false);
    setIsAuthenticated(false);
  };

  const clearSession = async () => {
    await clearLocalSession();
    setSessionExpired(false);
    setIsAuthenticated(false);
  };

  const clearSessionExpired = () => setSessionExpired(false);

  return (
    <AuthContext.Provider
      value={{ isAuthenticated, sessionExpired, signIn, signOut, clearSession, clearSessionExpired }}
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

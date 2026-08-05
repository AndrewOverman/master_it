type Listener = () => void;

let listener: Listener | null = null;

// The axios interceptor in client.ts runs outside the React tree and has no
// way to reach AuthContext's state directly. AuthProvider registers itself
// here on mount so a 401 can force a sign-out without a circular import
// between client.ts and AuthContext.tsx.
export function setSessionExpiredListener(handler: Listener | null): void {
  listener = handler;
}

export function notifySessionExpired(): void {
  listener?.();
}

// Apple expects the privacy policy and terms to be reachable next to account
// creation, not only from the App Store listing.
//
// Defaults derive from the API host so there's one thing to configure in the
// common case; either can be pointed somewhere else entirely (a marketing site,
// a Notion page) with EXPO_PUBLIC_PRIVACY_URL / EXPO_PUBLIC_TERMS_URL.
//
// The backend serves both at these paths (backend/routes/web.php, covered by
// LegalPagesTest) — renaming a path there without changing it here breaks the
// links silently, since nothing on this side can tell a 404 from a document.
const API_URL = process.env.EXPO_PUBLIC_API_URL ?? '';

export const PRIVACY_POLICY_URL = process.env.EXPO_PUBLIC_PRIVACY_URL ?? `${API_URL}/privacy`;
export const TERMS_URL = process.env.EXPO_PUBLIC_TERMS_URL ?? `${API_URL}/terms`;

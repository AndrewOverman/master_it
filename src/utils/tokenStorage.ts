import * as SecureStore from 'expo-secure-store';

const TOKEN_KEY = 'auth_token';

// Persisted beside the token purely so a restored session can re-identify the
// user to RevenueCat on launch. The token alone doesn't carry the ID, and
// RevenueCat has to be told who this is *before* a purchase — an anonymous
// purchase sends the webhook an $RCAnonymousID that User::find() can't
// resolve, and the subscription would never land on the account.
const USER_ID_KEY = 'auth_user_id';

export async function getToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function setToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function deleteToken(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}

export async function getStoredUserId(): Promise<number | null> {
  const raw = await SecureStore.getItemAsync(USER_ID_KEY);
  if (raw === null) return null;
  const parsed = Number(raw);
  return Number.isInteger(parsed) ? parsed : null;
}

export async function setStoredUserId(userId: number): Promise<void> {
  await SecureStore.setItemAsync(USER_ID_KEY, String(userId));
}

export async function deleteStoredUserId(): Promise<void> {
  await SecureStore.deleteItemAsync(USER_ID_KEY);
}

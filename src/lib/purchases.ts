import { Platform } from 'react-native';
import Purchases, { LOG_LEVEL, type PurchasesPackage } from 'react-native-purchases';

// Public SDK keys — safe to ship in the bundle (that's what "public" means
// here), unlike the RevenueCat *secret* key, which is server-side only and
// must never appear in this file or any EXPO_PUBLIC_ variable.
const API_KEY = Platform.select({
  ios: process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY,
  android: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY,
  default: undefined,
});

// Every export below is a no-op when there's no key. Dev and staging builds
// run without RevenueCat configured, and a paywall that can't load must
// degrade to "no purchases available" rather than taking the app down —
// Purchases.configure() throws on an empty key, and every other SDK call
// throws until configure() has succeeded.
let configured = false;

export function isPurchasesConfigured(): boolean {
  return configured;
}

/**
 * Idempotent: safe to call on every app start and after a fast refresh.
 *
 * Deliberately does NOT pass appUserID. Configuring anonymously and then
 * calling identifyPurchasesUser() at sign-in lets RevenueCat alias the
 * pre-login anonymous ID onto the real one, so a purchase made before the
 * account existed still follows the user. Passing the ID here instead would
 * only work when someone is already signed in at launch.
 */
export function configurePurchases(): void {
  if (configured || !API_KEY) return;

  if (__DEV__) {
    Purchases.setLogLevel(LOG_LEVEL.DEBUG);
  }

  Purchases.configure({ apiKey: API_KEY });
  configured = true;
}

/**
 * Ties the RevenueCat customer to our own user ID.
 *
 * This is the contract the backend webhook depends on: it looks the user up
 * with User::find($event['app_user_id']), so app_user_id has to be our
 * primary key and nothing else. Changing what's passed here silently breaks
 * every future webhook.
 */
export async function identifyPurchasesUser(userId: number): Promise<void> {
  if (!configured) return;
  await Purchases.logIn(String(userId));
}

/**
 * Returns the SDK to an anonymous user on sign-out, so the next person to
 * sign in on this device doesn't inherit the previous account's
 * entitlements.
 */
export async function resetPurchasesUser(): Promise<void> {
  if (!configured) return;
  // Throws when the current user is already anonymous — that's the desired
  // end state, not a failure, and sign-out must never be blocked by it.
  try {
    await Purchases.logOut();
  } catch {
    // ignored
  }
}

export type { PurchasesPackage };

/**
 * The packages in the "default" offering, or an empty list when RevenueCat
 * isn't configured or the offering has no products.
 *
 * Reading from the offering rather than a hardcoded product list is what
 * lets pricing, trials and product swaps be changed in the RevenueCat
 * dashboard without shipping a release.
 */
export async function getSubscriptionPackages(): Promise<PurchasesPackage[]> {
  if (!configured) return [];
  const offerings = await Purchases.getOfferings();
  return offerings.current?.availablePackages ?? [];
}

/**
 * Distinguishes "the user changed their mind" from "the purchase broke".
 *
 * A cancel is the single most common outcome on a paywall and must not
 * surface an error — `userCancelled` is the only reliable signal for it,
 * since the underlying store error codes differ per platform.
 */
export class PurchaseCancelledError extends Error {
  constructor() {
    super('Purchase cancelled');
    this.name = 'PurchaseCancelledError';
  }
}

export async function purchaseSubscription(pkg: PurchasesPackage): Promise<void> {
  if (!configured) throw new Error('Purchases are not available.');

  try {
    await Purchases.purchasePackage(pkg);
  } catch (error: any) {
    if (error?.userCancelled) throw new PurchaseCancelledError();
    throw error;
  }
}

/**
 * Returns whether any entitlement came back, so the caller can tell "restored
 * your subscription" from "there was nothing to restore" — reporting success
 * for the latter reads as a bug to someone who expected their purchase back.
 */
export async function restoreSubscription(): Promise<boolean> {
  if (!configured) return false;
  const customerInfo = await Purchases.restorePurchases();
  return Object.keys(customerInfo.entitlements.active).length > 0;
}

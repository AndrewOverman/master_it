import { PostHog } from 'posthog-react-native';

/**
 * Product analytics.
 *
 * Scope is deliberately narrow: this exists to answer questions the app
 * currently cannot answer at all — does anyone finish a plan, and does the
 * paywall convert — not to accumulate data for its own sake.
 *
 * Two rules hold everywhere below, and the privacy policy commits us to them:
 *
 * 1. No user-written text ever leaves in an event. Not goals, not refinement
 *    notes, not plan titles (which are derived from the goal). Properties are
 *    categorical or numeric only.
 * 2. Events are explicit. Autocapture and session replay are off, so nothing
 *    is collected that isn't named in the union below.
 */

// Public project key — safe in the bundle, and write-only: it can send events
// and cannot read anything back out of the project.
const API_KEY = process.env.EXPO_PUBLIC_POSTHOG_KEY;
const HOST = process.env.EXPO_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com';

let client: PostHog | null = null;

/**
 * Where the paywall was opened from. The whole point of instrumenting the
 * paywall is that these convert at very different rates — someone who just
 * hit a wall mid-task is not the same prospect as someone browsing Settings —
 * and without this property the conversion number is an average that describes
 * nobody.
 */
export type PaywallSource = 'new_plan_banner' | 'generation_limit' | 'refine_limit' | 'settings';

/**
 * Every event the app can send, and its properties.
 *
 * A closed union rather than loose strings: a typo in an event name is
 * invisible at runtime and silently splits a funnel in two, which is the
 * classic way analytics stops being trustworthy.
 */
export type AnalyticsEvent =
  // Activation
  | { name: 'signed_up'; properties?: never }
  | { name: 'signed_in'; properties?: never }
  // The core loop
  | { name: 'plan_generation_started'; properties: { skill_level: string; time_commitment: string; target_days: number | null } }
  | { name: 'plan_generation_completed'; properties: { step_count: number; waited_ms: number } }
  | { name: 'plan_generation_failed'; properties?: never }
  | { name: 'plan_generation_rejected'; properties?: never }
  | { name: 'plan_added_from_library'; properties: { source: 'featured' | 'shared' } }
  | { name: 'step_completed'; properties: { step_number: number; total_steps: number } }
  | { name: 'plan_completed'; properties: { total_steps: number } }
  | { name: 'plan_shared'; properties?: never }
  // Monetization
  | { name: 'generation_limit_hit'; properties: { tier: string } }
  | { name: 'paywall_viewed'; properties: { source: PaywallSource } }
  | { name: 'paywall_purchase_started'; properties: { tier: string | null } }
  | { name: 'paywall_purchase_completed'; properties: { tier: string | null } }
  | { name: 'paywall_purchase_cancelled'; properties: { tier: string | null } }
  | { name: 'paywall_purchase_failed'; properties: { tier: string | null } }
  | { name: 'paywall_restore_succeeded'; properties?: never }
  | { name: 'paywall_restore_found_nothing'; properties?: never };

export function isAnalyticsConfigured(): boolean {
  return client !== null;
}

/**
 * Idempotent, and a no-op without a key — dev and staging builds run without
 * PostHog configured, and nothing here may ever be load-bearing enough that
 * its absence changes how the app behaves.
 */
export function configureAnalytics(): void {
  if (client || !API_KEY) return;

  client = new PostHog(API_KEY, {
    host: HOST,
    // Explicit events only. Autocapture would sweep up screen names and touch
    // targets we haven't reasoned about, which is exactly the open-ended
    // collection the privacy policy says we don't do.
    captureAppLifecycleEvents: false,
    // Batches rather than one request per event; flushed on background too.
    flushAt: 20,
    flushInterval: 30000,
  });
}

/**
 * Ties events to our own user ID, the same identifier RevenueCat uses as its
 * app_user_id — so a funnel in PostHog and a subscriber in RevenueCat can be
 * matched up when a number looks wrong.
 *
 * Only the tier is attached as a person property. Name and email deliberately
 * are not: nothing in the funnel needs them, and not sending them is cheaper
 * than protecting them.
 */
export function identifyAnalyticsUser(userId: number, tier?: string): void {
  client?.identify(String(userId), tier ? { subscription_tier: tier } : undefined);
}

/** Returns to an anonymous ID so the next person signing in on this device isn't merged into the last one's profile. */
export function resetAnalyticsUser(): void {
  client?.reset();
}

export function track(event: AnalyticsEvent): void {
  client?.capture(event.name, event.properties ?? undefined);
}

/**
 * Sends anything buffered. Worth calling before a purchase hands control to
 * the store sheet: the OS can freeze or kill the app there, and losing the
 * events that lead up to a purchase is losing the funnel's most valuable step.
 */
export async function flushAnalytics(): Promise<void> {
  try {
    await client?.flush();
  } catch {
    // Never surface or block on a telemetry failure.
  }
}

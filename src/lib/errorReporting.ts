import * as Sentry from '@sentry/react-native';

/**
 * Crash and error reporting.
 *
 * Separate from analytics.ts on purpose: they answer different questions, have
 * different retention, and one of them should keep working when the other is
 * switched off. Both are no-ops without their key.
 */

const DSN = process.env.EXPO_PUBLIC_SENTRY_DSN;

let configured = false;

export function isErrorReportingConfigured(): boolean {
  return configured;
}

export function configureErrorReporting(): void {
  if (configured || !DSN) return;

  Sentry.init({
    dsn: DSN,
    // Which build an event came from. Without it, a crash report can't be told
    // apart from the same crash in staging.
    environment: process.env.EXPO_PUBLIC_ENVIRONMENT ?? 'production',
    // Off by default: PII here would mean IP addresses and request bodies, and
    // request bodies on this app include the user's goal text.
    sendDefaultPii: false,
    // Errors only. Performance tracing on a pre-launch app burns the free
    // quota to answer a question nobody is asking yet — turn it up when
    // there's a latency problem worth measuring.
    tracesSampleRate: 0,
    // The dev build's errors are already in Metro, and shipping them to Sentry
    // just makes the real signal harder to find.
    enabled: !__DEV__,
  });

  configured = true;
}

/**
 * Attaches the account to subsequent events, so a report can be tied back to
 * "this happened to a specific person" without carrying their name or email
 * into Sentry. The ID alone is enough to look them up ourselves.
 */
export function identifyErrorReportingUser(userId: number): void {
  if (!configured) return;
  Sentry.setUser({ id: String(userId) });
}

export function resetErrorReportingUser(): void {
  if (!configured) return;
  Sentry.setUser(null);
}

/**
 * @param context - Free-form breadcrumbs. Must not contain user-written text;
 *   the same rule analytics.ts follows, for the same reason.
 */
export function reportError(error: unknown, context?: Record<string, unknown>): void {
  if (!configured) {
    // Dev and staging still want the error visible somewhere.
    console.error('[errorReporting]', error, context);
    return;
  }

  Sentry.captureException(error, context ? { extra: context } : undefined);
}

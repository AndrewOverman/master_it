import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Localization from 'expo-localization';
import * as Notifications from 'expo-notifications';
import { registerPushToken, unregisterPushToken } from '../api/pushTokens';
import { setStepComplete, setStepDueDate } from '../api/plans';
import { queryClient } from './queryClient';

/**
 * Push notifications.
 *
 * Same shape as analytics.ts / purchases.ts: configure once at module
 * scope, no-op cleanly when the capability isn't available, and never let a
 * failure here reach the caller. Nothing in this file is allowed to break a
 * sign-in or a screen render — notifications are an enhancement, and a
 * device that can't receive them should simply not receive them.
 *
 * Push does not work in Expo Go or on a simulator; it needs a development
 * or EAS build on a physical device. `isPushSupported()` is what keeps that
 * from turning into a runtime error during local development.
 */

/**
 * Identifies the action buttons attached to a step reminder. Must match the
 * `categoryId` the backend sends — see ExpoPushService::send().
 */
const STEP_REMINDER_CATEGORY = 'step_reminder';

const ACTION_MARK_DONE = 'mark_done';
const ACTION_SNOOZE = 'snooze';

/**
 * The deep-link payload the backend attaches to every notification.
 * `screen` names a route in PlansStackParamList (or Settings), and the ids
 * are whatever that route needs.
 */
export interface NotificationPayload {
  type?: string;
  screen?: 'Today' | 'PlanDetail' | 'StepDetail' | 'NewPlan' | 'Settings';
  planId?: number;
  stepId?: number;
}

let configured = false;

/**
 * The EAS project id, which getExpoPushTokenAsync() requires. Read from the
 * running build's config rather than hardcoded so the dev/staging/production
 * variants each register against their own project.
 */
function projectId(): string | undefined {
  return (
    Constants.expoConfig?.extra?.eas?.projectId ??
    (Constants.easConfig as { projectId?: string } | undefined)?.projectId
  );
}

/**
 * Whether this device can receive push at all. False on simulators and in
 * Expo Go, where requesting a token throws rather than failing softly.
 */
export function isPushSupported(): boolean {
  return Device.isDevice && projectId() !== undefined;
}

/**
 * Foreground presentation rules plus the action-button categories.
 *
 * Called at module scope in App.tsx: a category registered after the
 * notification that references it arrives shows no buttons, so this cannot
 * wait for a component to mount.
 */
export function configurePushNotifications(): void {
  if (configured) return;
  configured = true;

  // A notification that arrives while the user is already looking at the
  // app still shows — the alternative is a step reminder silently
  // disappearing because they happened to have the app open.
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: true,
    }),
  });

  // The whole point of the actions: checking a step off shouldn't require
  // opening the app, and "not today" should be one tap rather than a trip
  // to the step screen to edit a date.
  Notifications.setNotificationCategoryAsync(STEP_REMINDER_CATEGORY, [
    {
      identifier: ACTION_MARK_DONE,
      buttonTitle: 'Mark done',
      options: { opensAppToForeground: false },
    },
    {
      identifier: ACTION_SNOOZE,
      buttonTitle: 'Snooze to tomorrow',
      options: { opensAppToForeground: false },
    },
  ]).catch(() => {
    // Categories are a nicety; the notification itself still works
    // without them.
  });

  if (Platform.OS === 'android') {
    // Android requires an explicit channel or notifications arrive with no
    // sound and no heads-up display.
    Notifications.setNotificationChannelAsync('default', {
      name: 'Reminders',
      importance: Notifications.AndroidImportance.DEFAULT,
    }).catch(() => {});
  }
}

/**
 * Whether the OS has already been asked, and what it said. Used by Settings
 * to show the real state rather than a switch that lies.
 */
export async function getPermissionStatus(): Promise<Notifications.PermissionStatus | 'unsupported'> {
  if (!isPushSupported()) return 'unsupported';

  try {
    const { status } = await Notifications.getPermissionsAsync();
    return status;
  } catch {
    return 'unsupported';
  }
}

/**
 * Asks for permission if it hasn't been decided yet, then registers this
 * device with the backend.
 *
 * Deliberately NOT called at launch. The prompt is spent the first time
 * it's shown — someone who declines it can only change their mind by
 * finding the OS settings screen — so it's asked at the point the value is
 * obvious, right after a plan is generated. See primePushPermission().
 *
 * @returns whether the device ended up registered.
 */
export async function registerForPushNotifications(): Promise<boolean> {
  if (!isPushSupported()) return false;

  try {
    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;

    if (status === 'undetermined') {
      status = (await Notifications.requestPermissionsAsync()).status;
    }

    if (status !== 'granted') return false;

    const { data: token } = await Notifications.getExpoPushTokenAsync({
      projectId: projectId(),
    });

    await registerPushToken({
      token,
      platform: Platform.OS === 'android' ? 'android' : 'ios',
      // The device is the only thing that actually knows this, and it's
      // what every local-time decision on the backend reads — quiet hours,
      // the nudge hour, and which steps count as due today.
      timezone: Localization.getCalendars()[0]?.timeZone ?? undefined,
    });

    return true;
  } catch {
    // Offline, permission revoked mid-flight, or a build without push
    // entitlements. None of these are worth surfacing.
    return false;
  }
}

/**
 * Registers only if permission was already granted — never prompts.
 *
 * This is what runs on sign-in and session restore. Someone who has
 * previously allowed notifications gets re-registered silently (their token
 * can rotate, and their timezone can change); someone who hasn't is left
 * alone until the priming moment.
 */
export async function registerIfAlreadyPermitted(): Promise<void> {
  if (!isPushSupported()) return;

  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') return;

    await registerForPushNotifications();
  } catch {
    // Never a reason to fail a sign-in.
  }
}

/**
 * The priming moment: called once a plan has finished generating, which is
 * the first point at which "we'll remind you about your steps" means
 * anything concrete to the user.
 */
export async function primePushPermission(): Promise<void> {
  if (!isPushSupported()) return;

  try {
    const { status } = await Notifications.getPermissionsAsync();

    // Only ever prompt on a genuinely undecided device. Re-asking someone
    // who declined does nothing — the OS won't show the prompt twice — and
    // re-asking someone who accepted is pointless.
    if (status !== 'undetermined') return;

    await registerForPushNotifications();
  } catch {
    // Nothing to recover; the user simply isn't registered.
  }
}

/**
 * Drops this device's registration. Called during sign-out, while the
 * bearer token is still valid — the DELETE is authenticated.
 */
export async function clearPushToken(): Promise<void> {
  if (!isPushSupported()) return;

  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') return;

    const { data: token } = await Notifications.getExpoPushTokenAsync({
      projectId: projectId(),
    });

    await unregisterPushToken(token);
    await setBadgeCount(0);
  } catch {
    // Best-effort, exactly like the logout request itself: a device that
    // fails to unregister is a stale row, not a broken sign-out.
  }
}

export async function setBadgeCount(count: number): Promise<void> {
  if (!isPushSupported()) return;

  try {
    await Notifications.setBadgeCountAsync(count);
  } catch {
    // Unsupported on some Android launchers.
  }
}

/**
 * Handles a tap on one of the action buttons.
 *
 * Runs outside the React tree — the OS invokes this with no mounted
 * component — so it can't use useToggleStep and has to invalidate the
 * caches by hand afterwards. Returns true when it consumed the response,
 * meaning the caller should not also navigate.
 */
export async function handleNotificationAction(
  response: Notifications.NotificationResponse
): Promise<boolean> {
  const action = response.actionIdentifier;

  if (action !== ACTION_MARK_DONE && action !== ACTION_SNOOZE) {
    return false;
  }

  const payload = (response.notification.request.content.data ?? {}) as NotificationPayload;

  if (typeof payload.planId !== 'number' || typeof payload.stepId !== 'number') {
    return true;
  }

  try {
    if (action === ACTION_MARK_DONE) {
      await setStepComplete(payload.planId, payload.stepId, true);
    } else {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      // Built from local date parts rather than toISOString(), which would
      // shift to the previous day west of Greenwich — the same reason
      // StepDetailScreen's formatDateInput() exists.
      const iso = [
        tomorrow.getFullYear(),
        String(tomorrow.getMonth() + 1).padStart(2, '0'),
        String(tomorrow.getDate()).padStart(2, '0'),
      ].join('-');

      await setStepDueDate(payload.planId, payload.stepId, iso);
    }

    // The app may well be running; without this it would show the step
    // exactly as it was before the action.
    queryClient.invalidateQueries({ queryKey: ['plan', payload.planId] });
    queryClient.invalidateQueries({ queryKey: ['plans'] });
  } catch {
    // The action failed (offline, expired session). The notification is
    // already dismissed by the OS at this point, so there's nowhere to
    // report it — the app will show the true state when next opened.
  }

  return true;
}

/**
 * The route a tapped notification should open, or null when there's
 * nothing useful to navigate to.
 */
export function routeForNotification(
  response: Notifications.NotificationResponse
): NotificationPayload | null {
  const payload = (response.notification.request.content.data ?? {}) as NotificationPayload;

  return payload.screen ? payload : null;
}

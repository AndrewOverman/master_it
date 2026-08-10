import { QueryClient } from '@tanstack/react-query';

/**
 * The app's single QueryClient.
 *
 * Lives here rather than in App.tsx because notification action handlers
 * ("Mark done", "Snooze") run outside the React tree — they're invoked by
 * the OS, with no mounted component and therefore no `useQueryClient()`.
 * They still have to invalidate the caches they just changed, or the app
 * would open showing a step the user already checked off from the
 * notification shade.
 */
export const queryClient = new QueryClient();

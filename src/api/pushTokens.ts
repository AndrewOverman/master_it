import { apiClient } from './client';

// POST /api/v1/push-tokens
// Registers this device for push. Idempotent by token — the app calls this
// on every launch and after any permission change, which is also what keeps
// the stored timezone current for someone who travels.
export async function registerPushToken(payload: {
  token: string;
  platform: 'ios' | 'android';
  timezone?: string;
}): Promise<void> {
  await apiClient.post('/api/v1/push-tokens', payload);
}

// DELETE /api/v1/push-tokens
// Unregisters this device. Must be called while the session is still valid —
// the route is behind auth:sanctum, so a sign-out that clears the bearer
// first would leave the token registered and the account still receiving
// notifications on a device nobody is signed into.
export async function unregisterPushToken(token: string): Promise<void> {
  await apiClient.delete('/api/v1/push-tokens', { data: { token } });
}

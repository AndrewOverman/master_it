import { apiClient } from './client';

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  // False until the address is confirmed via the emailed link. Gates plan
  // generation server-side (`verified` middleware on POST /plans), so the
  // banner and the New Plan form both read this rather than discovering it
  // from a rejected request. Optional for the same reason as the fields
  // below — login/register return the bare model, not UserResource.
  email_verified?: boolean;
  // Generation allowance, computed server-side (see UserResource) so the
  // rolling-window and free-tier rules live in exactly one place. Optional
  // because login/register still return the bare user shape.
  subscription_tier?: 'free' | 'starter' | 'pro';
  subscription_status?: 'active' | 'trialing' | 'canceled' | 'past_due' | 'expired' | null;
  // ISO-8601, or null on free / never-subscribed. Present even when the
  // subscription is cancelled — it's when access ends, not only when it
  // renews, which is why Settings keys the row off this rather than the tier.
  subscription_expires_at?: string | null;
  can_generate?: boolean;
  generations_remaining?: number;
  generations_limit?: number;
  // Only sent when can_generate is false — the same sentence the API's 429
  // body uses, so the up-front notice and the rejection can't disagree.
  generation_limit_message?: string;
}

export interface AuthResponse {
  user: AuthUser;
  token: string;
}

// POST /api/v1/login
export async function login(payload: { email: string; password: string }): Promise<AuthResponse> {
  const { data } = await apiClient.post<AuthResponse>('/api/v1/login', payload);
  return data;
}

// POST /api/v1/register
export async function register(payload: {
  name: string;
  email: string;
  password: string;
}): Promise<AuthResponse> {
  const { data } = await apiClient.post<AuthResponse>('/api/v1/register', payload);
  return data;
}

// POST /api/v1/logout
export async function logout(): Promise<void> {
  await apiClient.post('/api/v1/logout');
}

// POST /api/v1/forgot-password
// Always resolves — the backend gives the same response whether or not the
// email is registered, so there's nothing for a caller to branch on.
export async function forgotPassword(payload: { email: string }): Promise<void> {
  await apiClient.post('/api/v1/forgot-password', payload);
}

// POST /api/v1/reset-password
export async function resetPassword(payload: {
  email: string;
  token: string;
  password: string;
}): Promise<void> {
  await apiClient.post('/api/v1/reset-password', payload);
}

// POST /api/v1/email/verification-notification
// Always resolves for an authenticated caller, verified or not — the backend
// gives the same response either way, so there's nothing to branch on.
export async function resendVerificationEmail(): Promise<void> {
  await apiClient.post('/api/v1/email/verification-notification');
}

// GET /api/v1/user
export async function getCurrentUser(): Promise<AuthUser> {
  const { data } = await apiClient.get<AuthUser>('/api/v1/user');
  return data;
}

// DELETE /api/v1/user
// Password-confirmed and irreversible: the backend revokes every token and
// deletes the user (App Store Guideline 5.1.1(v) requires this be reachable
// in-app). A wrong password comes back as a 422 with `errors.password`.
export async function deleteAccount(payload: { password: string }): Promise<void> {
  await apiClient.delete('/api/v1/user', { data: payload });
}

// PATCH /api/v1/user
// current_password is only required when password is included.
export async function updateProfile(payload: {
  name?: string;
  email?: string;
  current_password?: string;
  password?: string;
}): Promise<AuthUser> {
  const { data } = await apiClient.patch<AuthUser>('/api/v1/user', payload);
  return data;
}

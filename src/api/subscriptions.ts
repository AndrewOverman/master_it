import { apiClient } from './client';
import type { AuthUser } from './auth';

export interface SubscriptionTier {
  id: 'free' | 'starter' | 'pro';
  name: string;
  monthly_generations: number;
}

// GET /api/v1/subscriptions/tiers
//
// The generation counts come from the same server-side config that
// User::canGenerate() enforces, so what the paywall promises is by
// construction what the API honours. Prices are not served here — those come
// from the store's localized priceString via RevenueCat.
export async function getSubscriptionTiers(): Promise<SubscriptionTier[]> {
  const { data } = await apiClient.get<{ data: SubscriptionTier[] }>('/api/v1/subscriptions/tiers');
  return data.data;
}

// POST /api/v1/user/subscription/refresh
//
// Deliberately sends no body: the server asks RevenueCat what this user is
// entitled to rather than believing the client. Returns the updated user, so
// the caller can write it straight into the ['user'] query cache.
export async function refreshSubscription(): Promise<AuthUser> {
  const { data } = await apiClient.post<AuthUser>('/api/v1/user/subscription/refresh');
  return data;
}

import { defaultShouldDehydrateQuery, type Query } from '@tanstack/react-query';

// Bump this when the Plan/PlanStep response shape changes, so an old
// on-device cache doesn't get restored against code that no longer
// expects its shape.
export const CACHE_BUSTER = 'v1';

export const MAX_CACHE_AGE = 14 * 24 * 60 * 60 * 1000; // 14 days

export const FEATURED_OFFLINE_SAMPLE_KEY = ['plans', 'featured', 'offline-sample'] as const;

// Controls exactly what survives to disk. Plans and their embedded steps
// persist; a step's full detail — the only query that ever carries
// `StepResource[]`, per types/plan.ts — and the unbounded featured-plans
// scroll do not.
export function shouldDehydrateQuery(query: Query): boolean {
  if (!defaultShouldDehydrateQuery(query)) return false;

  const key = query.queryKey as unknown[];
  const [entity, , sub, third] = key as [string, unknown, string | undefined, string | undefined];

  if (entity === 'plan') {
    // ['plan', id] persists; ['plan', id, 'step', stepId] and
    // ['plan', id, 'related'] do not.
    return key.length === 2;
  }

  if (entity === 'plans') {
    if (key.length === 1) return true; // ['plans']
    return sub === 'featured' && third === 'offline-sample';
  }

  return false;
}

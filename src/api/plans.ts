import { apiClient } from './client';
import type {
  Plan,
  PlanStatus,
  PlanStep,
  CreatePlanRequest,
  CreatePlanResponse,
  RefinePlanRequest,
  RefinePlanResponse,
  SubmitPlanFeedbackRequest,
  PaginatedResponse,
} from '../types/plan';

// POST /api/v1/plans
// Kicks off generation. Backend queues a job and returns immediately.
export async function createPlan(payload: CreatePlanRequest): Promise<CreatePlanResponse> {
  const { data } = await apiClient.post<CreatePlanResponse>('/api/v1/plans', payload);
  return data;
}

// GET /api/v1/plans/{id}
// Poll this until status !== 'generating'
export async function getPlan(id: number): Promise<Plan> {
  const { data } = await apiClient.get<Plan>(`/api/v1/plans/${id}`);
  return data;
}

// On first view of a step, the backend searches for resources inline
// (ResourceSearchService) before responding — worst case 61s server-side
// (see ResourceSearchService::search()). The client's default 15s timeout
// is well short of that, so left alone this call would time out on the
// client while the backend was still working, and React Query's automatic
// retry would then re-trigger another full search on top of the one still
// running server-side. Overridden here to comfortably clear that worst case.
const STEP_RESOURCE_SEARCH_TIMEOUT_MS = 75_000;

// GET /api/v1/plans/{planId}/steps/{stepId}
// Loads a single step with its resources. Resources are searched for
// lazily on the backend the first time a step is fetched this way, so
// this call may take longer than a typical GET on first view.
export async function getStep(planId: number, stepId: number): Promise<PlanStep> {
  const { data } = await apiClient.get<PlanStep>(`/api/v1/plans/${planId}/steps/${stepId}`, {
    timeout: STEP_RESOURCE_SEARCH_TIMEOUT_MS,
  });
  return data;
}

// PATCH /api/v1/plans/{planId}/steps/{stepId}
// Toggle a step's completion. Send the new desired state explicitly
// rather than "toggle" server-side, so retries are safe (idempotent).
export async function setStepComplete(
  planId: number,
  stepId: number,
  completed: boolean
): Promise<PlanStep> {
  const { data } = await apiClient.patch(
    `/api/v1/plans/${planId}/steps/${stepId}`,
    { completed }
  );
  return data;
}

// PATCH /api/v1/plans/{planId}/steps/{stepId}
// Update a step's due date (YYYY-MM-DD).
export async function setStepDueDate(
  planId: number,
  stepId: number,
  dueDate: string
): Promise<PlanStep> {
  const { data } = await apiClient.patch(
    `/api/v1/plans/${planId}/steps/${stepId}`,
    { due_date: dueDate }
  );
  return data;
}

// PATCH /api/v1/plans/{planId}
// Toggle a plan's completed state. Send the new desired state explicitly
// rather than "toggle" server-side, so retries are safe (idempotent).
export async function setPlanComplete(planId: number, completed: boolean): Promise<Plan> {
  const { data } = await apiClient.patch<Plan>(`/api/v1/plans/${planId}`, { completed });
  return data;
}

// POST /api/v1/plans/{planId}/reset
// Clears the plan's and all its steps' completed_at, so progress starts over.
export async function resetPlanProgress(planId: number): Promise<Plan> {
  const { data } = await apiClient.post<Plan>(`/api/v1/plans/${planId}/reset`);
  return data;
}

// POST /api/v1/plans/{planId}/retry
// Re-runs generation for a plan whose job failed, reusing the inputs already
// stored on it — so a failure costs the user neither their typing nor a
// second generation from their allowance. 409s for any status but 'failed'.
export async function retryPlan(planId: number): Promise<{ id: number; status: PlanStatus }> {
  const { data } = await apiClient.post<{ id: number; status: PlanStatus }>(
    `/api/v1/plans/${planId}/retry`
  );
  return data;
}

// POST /api/v1/plans/{planId}/refine
// Re-queues generation using the existing steps as a baseline plus the
// requested changes. Same 202 + poll-via-Generating pattern as createPlan.
export async function refinePlan(planId: number, payload: RefinePlanRequest): Promise<RefinePlanResponse> {
  const { data } = await apiClient.post<RefinePlanResponse>(`/api/v1/plans/${planId}/refine`, payload);
  return data;
}

// POST /api/v1/plans/{planId}/feedback
// Best-effort signal for tuning future generations — at least one of
// rating/tags must be present (backend 422s if both are empty).
export async function submitPlanFeedback(
  planId: number,
  payload: SubmitPlanFeedbackRequest
): Promise<void> {
  await apiClient.post(`/api/v1/plans/${planId}/feedback`, payload);
}

// GET /api/v1/plans
// List all of the user's plans, for a home/history screen later
export async function listPlans(): Promise<Plan[]> {
  const { data } = await apiClient.get<Plan[]>('/api/v1/plans');
  return data;
}

// GET /api/v1/plans/featured?page=N
// Admin-curated plans (is_featured flag), paginated for endless scroll
export async function listFeaturedPlans(page: number): Promise<PaginatedResponse<Plan>> {
  const { data } = await apiClient.get<PaginatedResponse<Plan>>('/api/v1/plans/featured', {
    params: { page },
  });
  return data;
}

// POST /api/v1/plans/{planId}/copy
// Clones a featured plan (and its steps) into the caller's own plans.
// Already generated, so it comes back ready immediately — no polling.
export async function copyPlan(planId: number): Promise<Plan> {
  const { data } = await apiClient.post<Plan>(`/api/v1/plans/${planId}/copy`);
  return data;
}

// GET /api/v1/plans/{planId}/related
// Featured plans whose prompt text overlaps with this plan's, ranked
// by relevance. May come back empty if nothing genuinely overlaps.
export async function getRelatedPlans(planId: number): Promise<Plan[]> {
  const { data } = await apiClient.get<Plan[]>(`/api/v1/plans/${planId}/related`);
  return data;
}

// POST /api/v1/plans/{planId}/share
// Owner-only. Mints a share token the first time it's called, then just
// returns the same one on subsequent calls.
export async function sharePlan(planId: number): Promise<string> {
  const { data } = await apiClient.post<{ share_token: string }>(`/api/v1/plans/${planId}/share`);
  return data.share_token;
}

// DELETE /api/v1/plans/{planId}/share
// Owner-only. Revokes the share link — anyone still holding it gets a 404.
export async function unsharePlan(planId: number): Promise<void> {
  await apiClient.delete(`/api/v1/plans/${planId}/share`);
}

// GET /api/v1/plans/shared/{token}
// Read-only preview of someone else's plan via their share link. Any
// authenticated user can call this, not just the owner.
export async function getSharedPlan(token: string): Promise<Plan> {
  const { data } = await apiClient.get<Plan>(`/api/v1/plans/shared/${token}`);
  return data;
}

// POST /api/v1/plans/shared/{token}/copy
// Clones the shared plan (and its steps) into the caller's own plans.
export async function copySharedPlan(token: string): Promise<Plan> {
  const { data } = await apiClient.post<Plan>(`/api/v1/plans/shared/${token}/copy`);
  return data;
}

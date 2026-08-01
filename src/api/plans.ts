import { apiClient } from './client';
import type {
  Plan,
  PlanStep,
  CreatePlanRequest,
  CreatePlanResponse,
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

// GET /api/v1/plans/{planId}/steps/{stepId}
// Loads a single step with its resources. Resources are searched for
// lazily on the backend the first time a step is fetched this way, so
// this call may take longer than a typical GET on first view.
export async function getStep(planId: number, stepId: number): Promise<PlanStep> {
  const { data } = await apiClient.get<PlanStep>(`/api/v1/plans/${planId}/steps/${stepId}`);
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

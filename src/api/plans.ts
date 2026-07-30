import { apiClient } from './client';
import type { Plan, PlanStep, CreatePlanRequest, CreatePlanResponse } from '../types/plan';

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

// GET /api/v1/plans
// List all of the user's plans, for a home/history screen later
export async function listPlans(): Promise<Plan[]> {
  const { data } = await apiClient.get<Plan[]>('/api/v1/plans');
  return data;
}

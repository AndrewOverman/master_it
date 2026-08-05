// Types matching the Laravel API response shapes.
// Keep these in sync with your Laravel API Resources.

export type PlanStatus = 'generating' | 'ready' | 'failed' | 'rejected';

// Must stay hand-synced with GeneratePlanSteps::TAG_INSTRUCTIONS on the
// backend (backend/app/Jobs/GeneratePlanSteps.php) — that's the single
// source of truth for which tags exist and what they mean to the LLM.
export type RefinementTag =
  | 'less_intense'
  | 'more_beginner_friendly'
  | 'no_equipment'
  | 'shorter_timeline'
  | 'more_detail'
  | 'more_variety';

export const REFINEMENT_TAG_LABELS: Record<RefinementTag, string> = {
  less_intense: 'Less intense',
  more_beginner_friendly: 'More beginner-friendly',
  no_equipment: 'No equipment needed',
  shorter_timeline: 'Shorter timeline',
  more_detail: 'More detail',
  more_variety: 'More variety',
};

export interface PlanRefinement {
  id: number;
  tags: RefinementTag[];
  notes: string | null;
  status: 'pending' | 'applied' | 'failed';
  created_at: string;
}

export interface StepResource {
  id: number;
  url: string;
  title: string;
  source: string | null;
  description: string | null;
}

export interface PlanStep {
  id: number;
  order: number;
  title: string;
  description: string;
  estimated_days: number | null;
  due_date: string | null; // ISO date string, null if not scheduled
  completed_at: string | null; // ISO datetime string, null if not done
  video_url: string | null; // YouTube link, not every step has one (max 2 per plan)
  video_title: string | null;
  video_channel: string | null;
  // Only present once fetched via getStep() — absent (undefined) on the
  // steps embedded in a plan's own response, since the plan list doesn't
  // load resources for every step up front.
  resources?: StepResource[];
}

export interface Plan {
  id: number;
  title: string;
  emoji: string | null; // set once the plan finishes generating
  original_prompt: string;
  status: PlanStatus;
  completed_at: string | null; // ISO datetime string, set when the user manually marks the plan done
  error_message: string | null; // populated if status === 'failed'
  skill_level: 'beginner' | 'intermediate' | 'advanced' | null;
  time_commitment: 'light' | 'moderate' | 'intensive' | null;
  target_days: number | null;
  created_at: string;
  // Only present when the requester owns the plan — absent (undefined) on
  // shared/featured views of someone else's plan.
  share_token?: string | null;
  share_token_expires_at?: string | null; // ISO datetime string, set 30 days out when share_token is minted
  // Owner-only, like share_token above. Null if the plan has never been
  // refined; check .status === 'failed' to detect a refine attempt that
  // didn't take (the plan itself stays 'ready' either way).
  latest_refinement?: PlanRefinement | null;
  steps: PlanStep[];
}

// Shape of a Laravel paginated resource collection response
export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    current_page: number;
    last_page: number;
  };
}

// Request body for POST /api/v1/plans
export interface CreatePlanRequest {
  prompt: string;
  skill_level?: 'beginner' | 'intermediate' | 'advanced';
  time_commitment?: 'light' | 'moderate' | 'intensive'; // e.g. 15min/day vs 1hr/day
  target_days?: number; // optional deadline, e.g. "learn this in 30 days"
}

// Response from POST /api/v1/plans — plan is created but generation
// happens in a queued job, so steps will be empty and status "generating"
export interface CreatePlanResponse {
  id: number;
  status: PlanStatus;
}

// Request body for POST /api/v1/plans/{planId}/refine. At least one of
// tags/notes must be present — the backend 422s if both are empty.
export interface RefinePlanRequest {
  tags?: RefinementTag[];
  notes?: string;
}

// Response from POST /api/v1/plans/{planId}/refine — same shape as
// CreatePlanResponse, since refining re-queues generation the same way.
export interface RefinePlanResponse {
  id: number;
  status: PlanStatus;
}

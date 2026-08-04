// Types matching the Laravel API response shapes.
// Keep these in sync with your Laravel API Resources.

export type PlanStatus = 'generating' | 'ready' | 'failed' | 'rejected';

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

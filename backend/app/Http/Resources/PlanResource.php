<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class PlanResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'title' => $this->title,
            'emoji' => $this->emoji,
            'original_prompt' => $this->original_prompt,
            'status' => $this->status,
            'completed_at' => $this->completed_at?->toISOString(),
            'error_message' => $this->error_message,
            'skill_level' => $this->skill_level,
            'time_commitment' => $this->time_commitment,
            'target_days' => $this->target_days,
            'created_at' => $this->created_at?->toISOString(),
            // Only the owner ever sees the raw token — a shared/featured
            // viewer gets everything else in this resource but not the
            // ability to re-derive or manage the share link itself.
            'share_token' => $this->when($request->user()?->id === $this->user_id, $this->share_token),
            'share_token_expires_at' => $this->when(
                $request->user()?->id === $this->user_id,
                $this->share_token_expires_at?->toISOString()
            ),
            // Closure-wrapped (not a bare value like share_token above)
            // because latestRefinement is a relationship access — a bare
            // value would evaluate (and query) unconditionally before
            // when() ever checks ownership.
            'latest_refinement' => $this->when(
                $request->user()?->id === $this->user_id,
                fn () => $this->latestRefinement ? new PlanRefinementResource($this->latestRefinement) : null
            ),
            'steps' => PlanStepResource::collection($this->whenLoaded('steps')),
        ];
    }
}

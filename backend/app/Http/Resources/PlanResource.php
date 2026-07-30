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
            'original_prompt' => $this->original_prompt,
            'status' => $this->status,
            'error_message' => $this->error_message,
            'created_at' => $this->created_at?->toISOString(),
            'steps' => PlanStepResource::collection($this->whenLoaded('steps')),
        ];
    }
}

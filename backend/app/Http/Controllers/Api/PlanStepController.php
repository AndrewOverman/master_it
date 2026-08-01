<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\PlanStepResource;
use App\Models\Plan;
use App\Models\PlanStep;
use App\Services\ResourceSearchService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Throwable;

class PlanStepController extends Controller
{
    public function show(Request $request, Plan $plan, PlanStep $step)
    {
        abort_unless($plan->user_id === $request->user()->id, 404);
        abort_unless($step->plan_id === $plan->id, 404);

        if (is_null($step->resources_fetched_at)) {
            $this->ensureResources($step);
        }

        return new PlanStepResource($step->load('resources'));
    }

    public function update(Request $request, Plan $plan, PlanStep $step)
    {
        abort_unless($plan->user_id === $request->user()->id, 404);
        abort_unless($step->plan_id === $plan->id, 404);

        $validated = $request->validate([
            'completed' => ['sometimes', 'required', 'boolean'],
            'due_date' => ['sometimes', 'nullable', 'date'],
        ]);

        $updates = [];
        if (array_key_exists('completed', $validated)) {
            $updates['completed_at'] = $validated['completed'] ? now() : null;
        }
        if (array_key_exists('due_date', $validated)) {
            $updates['due_date'] = $validated['due_date'];
        }

        $step->update($updates);

        return new PlanStepResource($step);
    }

    /**
     * Resources are per-step content, but many users can each copy the
     * same featured plan — without this, every copy would independently
     * pay for its own Claude search for what is identical step content.
     * `canonicalStepFor()` resolves a copied step back to its counterpart
     * on the featured plan it was copied from (copying is only ever
     * allowed directly from a featured plan, so this is a single hop,
     * never a chain). Whichever step — original or any one copy — gets
     * viewed first pays for the search; every other copy then reuses it.
     */
    private function ensureResources(PlanStep $step): void
    {
        $canonical = $this->canonicalStepFor($step);

        if ($canonical->is($step)) {
            $this->fetchResources($step);

            return;
        }

        if (is_null($canonical->resources_fetched_at)) {
            $this->fetchResources($canonical);
            $canonical->refresh();
        }

        if ($canonical->resources_fetched_at) {
            $this->copyResources($canonical, $step);
        }
    }

    private function canonicalStepFor(PlanStep $step): PlanStep
    {
        $plan = $step->plan;

        if ($plan->is_featured || is_null($plan->source_plan_id)) {
            return $step;
        }

        return PlanStep::where('plan_id', $plan->source_plan_id)
            ->where('order', $step->order)
            ->first() ?? $step;
    }

    private function copyResources(PlanStep $from, PlanStep $to): void
    {
        foreach ($from->resources()->get() as $resource) {
            $to->resources()->create([
                'url' => $resource->url,
                'title' => $resource->title,
                'source' => $resource->source,
                'description' => $resource->description,
                'order' => $resource->order,
            ]);
        }

        $to->update(['resources_fetched_at' => $from->resources_fetched_at]);
    }

    /**
     * Lazily searches for and persists this step's resources on first
     * view. A search failure (or a missing API key) just leaves the step
     * with no resources for now — it isn't worth failing the page load
     * over, and leaving `resources_fetched_at` unset lets a later visit
     * retry once the underlying problem (e.g. a transient API error) is
     * gone.
     */
    private function fetchResources(PlanStep $step): void
    {
        $service = app(ResourceSearchService::class);

        if (! $service->isConfigured()) {
            return;
        }

        try {
            $resources = $service->search($step->title, $step->description);

            foreach ($resources as $index => $resource) {
                $step->resources()->create([
                    'url' => $resource['url'],
                    'title' => $resource['title'],
                    'source' => $resource['source'],
                    'description' => $resource['description'],
                    'order' => $index,
                ]);
            }

            $step->update(['resources_fetched_at' => now()]);
        } catch (Throwable $e) {
            Log::warning('PlanStepController: resource search failed', [
                'step_id' => $step->id,
                'error' => $e->getMessage(),
            ]);
        }
    }
}

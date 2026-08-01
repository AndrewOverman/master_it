<?php

namespace App\Jobs;

use App\Models\Plan;
use App\Services\YouTubeVideoSearchService;
use Carbon\Carbon;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use RuntimeException;
use Throwable;

/**
 * Asks Claude to break the plan's original prompt into a concrete, ordered
 * set of steps (tailored to the goal, skill level, time commitment, and
 * target length), then persists them.
 *
 * The instructions + examples below are identical on every call, so they're
 * sent as a cached `system` block (prompt caching) rather than folded into
 * the per-plan user message. Only the actual goal/skill level/time
 * commitment/target days varies per call.
 */
class GeneratePlanSteps implements ShouldQueue
{
    use Queueable;

    // Not every step gets a video, and never more than this many per plan —
    // videos are a supplement for steps that genuinely benefit from a visual
    // demonstration, not a default for every step.
    private const MAX_VIDEOS_PER_PLAN = 2;

    private const SYSTEM_PROMPT = <<<'PROMPT'
        You are an expert curriculum and project planner. Your job is to take
        someone's stated goal and turn it into a concrete, sequential, achievable
        plan of steps.

        ## What makes a good plan step

        - SPECIFIC to the actual goal, not generic advice that could apply to any
          goal. "Learn the fundamentals" is bad; "Learn the difference between
          bulk fermentation and proofing, and how each affects crumb texture" is
          good.
        - ACTIONABLE: a step should describe something the person can go and DO,
          not just a topic to "understand" or "study."
        - SEQUENTIAL: each step should build on the previous one. Early steps
          establish fundamentals or gather materials/tools; middle steps practice
          and build; later steps refine, test, and finish.
        - SCOPED to the stated skill level and time commitment. A beginner with
          15 minutes a day needs smaller, more numerous, more forgiving steps
          than an advanced person with several hours a day.
        - REALISTIC on time: estimated_days per step should reflect genuine
          effort at the stated time commitment, not an arbitrary round number.
        - Named for the activity, not the phase. Never use generic phase labels
          like "Learn the fundamentals," "Practice the basics," or "Put it to
          the test" — always describe the actual, concrete activity implied by
          the goal.

        ## Examples of good breakdowns

        ### Example 1
        Goal: "I want to learn to play basic chords on guitar" (beginner, moderate
        time commitment, ~21 days)
        Steps:
        1. "Learn proper hand position and how to read chord diagrams" (3 days) —
           Get comfortable holding the guitar, fretting with your fingertips, and
           reading a chord chart before trying to play anything.
        2. "Master the open chords: E, A, D, G, C" (7 days) — Practice switching
           cleanly between these five chords one at a time until each rings out
           clearly with no buzzing.
        3. "Practice chord transitions in a simple progression" (5 days) — Drill
           a common progression like G-C-D-G slowly, then bring it up to tempo
           with a metronome.
        4. "Learn basic strumming patterns" (3 days) — Add simple down-up
           strumming patterns on top of the chords you've learned.
        5. "Play one full song from start to finish" (3 days) — Pick a simple
           song using only the chords you've practiced and play it start to
           finish without stopping.

        ### Example 2
        Goal: "I want to train for a 5K run" (beginner, light time commitment,
        ~30 days)
        Steps:
        1. "Establish a walk-run baseline" (5 days) — Alternate 1 minute of
           jogging with 2 minutes of walking for 20 minutes, to build initial
           cardiovascular tolerance without injury.
        2. "Increase jogging intervals" (7 days) — Extend jogging intervals to
           3-4 minutes with 1-2 minute walk breaks.
        3. "Build continuous running distance" (10 days) — Work up to jogging
           continuously for 20 minutes without a walk break.
        4. "Practice race pace and distance" (5 days) — Run the full 5K distance
           (3.1 miles) at an easy, sustainable pace at least twice.
        5. "Taper and prepare for race day" (3 days) — Reduce training volume,
           rest, and do a short easy shakeout run before race day.

        ### Example 3
        Goal: "I want to build and launch a personal portfolio website"
        (intermediate, moderate time commitment, ~14 days)
        Steps:
        1. "Sketch the site structure and content" (2 days) — List every page
           and section you need (home, projects, about, contact) and what goes
           on each, before writing any code.
        2. "Build the static layout and navigation" (3 days) — Implement the
           page structure and navigation with placeholder content so the site's
           skeleton is click-through-able.
        3. "Add real content and project write-ups" (4 days) — Replace
           placeholders with your actual bio, project descriptions, and images.
        4. "Style the site and make it responsive" (3 days) — Apply a consistent
           visual design and test it at mobile, tablet, and desktop widths.
        5. "Deploy and do a final cross-browser check" (2 days) — Push the site
           to hosting, then verify links, forms, and layout in at least two
           different browsers.

        ## Output format

        Call the create_plan_steps tool with:
        - emoji: a single emoji that visually represents this specific goal
          (e.g. a guitar for learning guitar, a wrench for fixing a faucet, a
          running shoe for training for a race). Pick something concrete and
          recognizable, not a generic "sparkles" or "checklist" emoji.
        - steps: 4-7 sequential steps. Each step needs:
          - title: a short, specific action (not a topic or phase name)
          - description: 1-2 sentences explaining exactly what to do, specific
            to the actual goal
          - estimated_days: how many days this step should reasonably take at
            the stated time commitment
          - needs_video: true only if seeing the technique demonstrated would
            genuinely help more than text would (a physical movement, hand
            position, or visual process — e.g. a chord grip, a running form
            cue, a knife technique). Mark true for at most 2 steps across the
            whole plan — the ones where it helps most. false for the rest,
            including any step that's just practice, research, planning, or
            purely conceptual.

        The estimated_days across all steps should sum to approximately the
        requested total plan length.
        PROMPT;

    public function __construct(
        public Plan $plan,
    ) {}

    public function handle(): void
    {
        ['emoji' => $emoji, 'steps' => $steps] = $this->generatePlanFromClaude();

        $videoService = app(YouTubeVideoSearchService::class);
        $videosRemaining = self::MAX_VIDEOS_PER_PLAN;

        if (! $videoService->isConfigured()) {
            Log::info('GeneratePlanSteps: YOUTUBE_API_KEY not configured, skipping video attachment', [
                'plan_id' => $this->plan->id,
            ]);
        }

        $cumulativeDays = 0;

        foreach ($steps as $index => $step) {
            $cumulativeDays += $step['estimated_days'];

            $video = null;

            if ($videosRemaining > 0 && ($step['needs_video'] ?? false)) {
                $video = $this->findVideoForStep($videoService, $step);

                if ($video) {
                    $videosRemaining--;
                }
            }

            $this->plan->steps()->create([
                'order' => $index + 1,
                'title' => $step['title'],
                'description' => $step['description'],
                'estimated_days' => $step['estimated_days'],
                'due_date' => $this->plan->created_at->copy()->addDays($cumulativeDays),
                'video_url' => $video['url'] ?? null,
                'video_title' => $video['title'] ?? null,
                'video_channel' => $video['channel'] ?? null,
                'video_view_count' => $video['view_count'] ?? null,
                'video_published_at' => $video['published_at'] ?? null,
            ]);
        }

        $this->plan->update(['status' => 'ready', 'emoji' => $emoji]);
    }

    /**
     * @param  array{title: string, description: string}  $step
     * @return array{url: string, title: string, channel: string, view_count: int, published_at: Carbon}|null
     */
    private function findVideoForStep(YouTubeVideoSearchService $videoService, array $step): ?array
    {
        $query = "{$step['title']} {$this->plan->original_prompt} tutorial";

        try {
            return $videoService->search($query);
        } catch (Throwable $e) {
            // A video search failure is never worth failing the whole plan
            // over — the step just ends up with no video.
            Log::warning('GeneratePlanSteps: video search failed', [
                'plan_id' => $this->plan->id,
                'step_title' => $step['title'],
                'error' => $e->getMessage(),
            ]);

            return null;
        }
    }

    /**
     * @return array{emoji: ?string, steps: array<int, array{title: string, description: string, estimated_days: int, needs_video: bool}>}
     */
    private function generatePlanFromClaude(): array
    {
        $apiKey = config('services.anthropic.api_key');

        if (! $apiKey) {
            throw new RuntimeException('ANTHROPIC_API_KEY is not configured.');
        }

        $response = Http::withHeaders([
            'x-api-key' => $apiKey,
            'anthropic-version' => '2023-06-01',
        ])
            ->timeout(60)
            ->retry(2, 1000)
            ->post('https://api.anthropic.com/v1/messages', [
                'model' => config('services.anthropic.model'),
                'max_tokens' => 2048,
                // Identical on every call: cached as one block with the
                // tools definition that precedes it (render order is
                // tools -> system -> messages; a breakpoint on the last
                // system block caches both).
                'system' => [
                    [
                        'type' => 'text',
                        'text' => self::SYSTEM_PROMPT,
                        'cache_control' => ['type' => 'ephemeral'],
                    ],
                ],
                'tools' => [[
                    'name' => 'create_plan_steps',
                    'description' => 'Return an emoji and a structured, ordered list of steps for a personalized goal plan.',
                    'input_schema' => [
                        'type' => 'object',
                        'properties' => [
                            'emoji' => [
                                'type' => 'string',
                                'description' => 'A single emoji visually representing this specific goal.',
                            ],
                            'steps' => [
                                'type' => 'array',
                                'minItems' => 3,
                                'maxItems' => 8,
                                'items' => [
                                    'type' => 'object',
                                    'properties' => [
                                        'title' => ['type' => 'string'],
                                        'description' => ['type' => 'string'],
                                        'estimated_days' => ['type' => 'integer', 'minimum' => 1],
                                        'needs_video' => ['type' => 'boolean'],
                                    ],
                                    'required' => ['title', 'description', 'estimated_days', 'needs_video'],
                                ],
                            ],
                        ],
                        'required' => ['emoji', 'steps'],
                    ],
                ]],
                'tool_choice' => ['type' => 'tool', 'name' => 'create_plan_steps'],
                // Only the per-plan specifics — short, and different every
                // call, so it's never worth caching.
                'messages' => [
                    ['role' => 'user', 'content' => $this->buildPrompt()],
                ],
            ]);

        if ($response->failed()) {
            throw new RuntimeException('Anthropic API request failed: '.$response->body());
        }

        $usage = $response->json('usage', []);
        Log::info('GeneratePlanSteps: Anthropic prompt cache usage', [
            'plan_id' => $this->plan->id,
            'cache_creation_input_tokens' => $usage['cache_creation_input_tokens'] ?? null,
            'cache_read_input_tokens' => $usage['cache_read_input_tokens'] ?? null,
            'input_tokens' => $usage['input_tokens'] ?? null,
        ]);

        $toolUse = collect($response->json('content'))->firstWhere('type', 'tool_use');
        $steps = $toolUse['input']['steps'] ?? null;
        $emoji = $toolUse['input']['emoji'] ?? null;

        // Claude occasionally returns nested tool input fields as a
        // JSON-encoded string instead of a native array; decode defensively.
        if (is_string($steps)) {
            $steps = json_decode($steps, true);
        }

        if (! is_array($steps) || empty($steps)) {
            throw new RuntimeException('Anthropic response did not include any usable steps.');
        }

        return ['emoji' => is_string($emoji) ? $emoji : null, 'steps' => $steps];
    }

    private function buildPrompt(): string
    {
        $totalDays = $this->plan->target_days ?? 30;
        $skillLevel = $this->plan->skill_level ?? 'unspecified';
        $timeCommitment = $this->plan->time_commitment ?? 'unspecified';

        return <<<PROMPT
            Goal: "{$this->plan->original_prompt}"
            Skill level: {$skillLevel}
            Time commitment: {$timeCommitment}
            Target plan length: approximately {$totalDays} days total
            PROMPT;
    }

    public function failed(Throwable $exception): void
    {
        $this->plan->update([
            'status' => 'failed',
            'error_message' => $exception->getMessage(),
        ]);
    }
}

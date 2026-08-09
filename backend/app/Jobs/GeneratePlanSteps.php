<?php

namespace App\Jobs;

use App\Models\Plan;
use App\Services\YouTubeVideoSearchService;
use Carbon\Carbon;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\DB;
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

    private const DEFAULT_TARGET_DAYS = 30;

    // How long a single step should ideally represent. A step is a chunk the
    // user can hold in their head and finish before losing the thread, so its
    // length tracks how much time they've actually got per day. The step count
    // then falls out of the plan length rather than being a fixed range —
    // otherwise a two-week plan and a six-month plan come back the same shape.
    private const IDEAL_STEP_DAYS = [
        'intensive' => 2.5,
        'moderate' => 4.5,
        'light' => 7.0,
    ];

    private const DEFAULT_IDEAL_STEP_DAYS = 4.5;

    // At the same time commitment a beginner needs smaller, more numerous
    // steps than an advanced person. The system prompt asks for this too;
    // this is what actually enforces it in the step count.
    private const BEGINNER_STEP_DAYS_FACTOR = 0.75;

    // Below MIN_STEPS a plan doesn't read as a plan; above MAX_STEPS it reads
    // as a backlog and completion drops off. Longer plans get longer steps,
    // not more of them.
    private const MIN_STEPS = 4;

    private const MAX_STEPS = 8;

    // The categories flag_unsupported_goal may return. Declared once and
    // used both in the tool schema below and to validate what comes back,
    // so a category Claude is offered can't be one we then discard.
    private const REJECTION_CATEGORIES = ['illegal', 'obscene', 'violent'];

    // Anything outside REJECTION_CATEGORIES lands here rather than being
    // trusted through to the database.
    private const FALLBACK_REJECTION_CATEGORY = 'other';

    // Maps a refinement tag to the instruction sentence sent to Claude.
    // PlanController validates incoming tags against availableTags() below,
    // so this is the one place the set of valid tags is defined.
    private const TAG_INSTRUCTIONS = [
        'less_intense' => 'Reduce intensity/difficulty relative to the current steps.',
        'more_beginner_friendly' => 'Simplify steps and assume less prior knowledge than before.',
        'no_equipment' => 'Avoid steps that require special equipment, tools, or a gym/facility.',
        'shorter_timeline' => 'Compress the plan into a shorter total timeframe.',
        'more_detail' => 'Add more specific, concrete detail to each step\'s description.',
        'more_variety' => 'Introduce more varied activities rather than repeating similar steps.',
    ];

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
          Steps genuinely differ in size, so the estimates should differ too —
          a plan where every step carries the same number of days reads as a
          template rather than a considered breakdown of this specific goal.
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

        ## Refining an existing plan

        Sometimes the user message below will include a "Current plan steps"
        list and a "Requested changes" list instead of just a bare goal. When
        that happens, you're revising an existing plan, not starting from a
        blank page:

        - Keep steps that still serve the goal and aren't touched by the
          requested changes — don't rewrite a step that isn't broken just to
          sound different.
        - Apply every requested change concretely. If a change conflicts with
          an existing step, change or replace that step; don't just append a
          caveat to it.
        - The revised plan should still have exactly the number of steps
          stated in the user message, following all the same guidance above
          (specific, actionable, sequential, scoped, realistic, named for the
          activity). That count is fixed by the plan's length and time
          commitment, so honour it even if the requested changes tempt you to
          add or drop a step — fold a change into the existing steps instead.
        - The same content policy below still applies — call
          flag_unsupported_goal instead if the requested changes themselves
          push the goal into an unsupported category, exactly as you would
          for an original goal.

        ## Output format

        Call the create_plan_steps tool with:
        - emoji: a single emoji that visually represents this specific goal
          (e.g. a guitar for learning guitar, a wrench for fixing a faucet, a
          running shoe for training for a race). Pick something concrete and
          recognizable, not a generic "sparkles" or "checklist" emoji.
        - steps: sequential steps, exactly as many as the "Number of steps"
          line in the user message asks for — that count is derived from the
          plan's length and the person's time commitment, so treat it as a
          requirement rather than a suggestion. Each step needs:
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

        ## Content policy

        Most goals are fine, including ones that are edgy, physically risky,
        or adjacent to regulated activities (e.g. home-brewing alcohol,
        learning lockpicking as a hobby, training in a combat sport,
        legal firearm marksmanship). Only decline when the goal itself is:

        - ILLEGAL: the plan would walk someone through committing a crime
          (making weapons or drugs, hacking into systems you don't own,
          evading law enforcement, fraud, etc.) — not merely a topic that
          touches on legality.
        - OBSCENE OR SEXUAL: the goal is about producing sexual content
          involving minors, or is generally pornographic/sexual in nature
          rather than a legitimate skill or project.
        - GRATUITOUSLY VIOLENT OR DISTURBING: the goal is centered on
          gore, cruelty to people or animals, or self-harm rather than a
          constructive activity.

        If, and only if, the goal falls into one of those categories, call
        the flag_unsupported_goal tool instead of create_plan_steps. Do not
        lecture, moralize, or explain your reasoning at length — a short
        internal category and reason is enough, since the app writes its
        own user-facing message. When in doubt, prefer create_plan_steps —
        false refusals of legitimate goals are worse than the rare miss.
        PROMPT;

    public function __construct(
        public Plan $plan,
        public bool $isRefinement = false,
    ) {}

    /**
     * @return list<string>
     */
    public static function availableTags(): array
    {
        return array_keys(self::TAG_INSTRUCTIONS);
    }

    /**
     * How many steps this plan should come back with. Decided here rather
     * than left to Claude: the model is good at what goes in a step and has
     * no idea what length still reads as an achievable plan on a phone.
     *
     * Capped by the plan length itself as well as MAX_STEPS, since every step
     * costs at least a day — a 3-day plan can't honestly carry 4 of them.
     */
    private function stepBudget(): int
    {
        $totalDays = $this->plan->target_days ?? self::DEFAULT_TARGET_DAYS;

        $idealStepDays = self::IDEAL_STEP_DAYS[$this->plan->time_commitment ?? '']
            ?? self::DEFAULT_IDEAL_STEP_DAYS;

        if ($this->plan->skill_level === 'beginner') {
            $idealStepDays *= self::BEGINNER_STEP_DAYS_FACTOR;
        }

        $ceiling = (int) min(self::MAX_STEPS, max(1, $totalDays));
        $floor = (int) min(self::MIN_STEPS, $ceiling);

        return (int) max($floor, min($ceiling, round($totalDays / $idealStepDays)));
    }

    public function handle(): void
    {
        $result = $this->generatePlanFromClaude();

        if ($result['type'] === 'rejected') {
            Log::info('GeneratePlanSteps: goal flagged by content policy', [
                'plan_id' => $this->plan->id,
                'category' => $result['category'],
                'reason' => $result['reason'],
            ]);

            // A refinement's requested changes can themselves get flagged,
            // but that must never take down an already-working plan.
            if ($this->isRefinement) {
                $this->abandonRefinement();

                return;
            }

            $this->plan->update([
                'status' => 'rejected',
                'rejection_category' => $result['category'],
            ]);

            return;
        }

        ['emoji' => $emoji, 'steps' => $steps] = $result;

        $videoService = app(YouTubeVideoSearchService::class);

        if (! $videoService->isConfigured()) {
            Log::info('GeneratePlanSteps: YOUTUBE_API_KEY not configured, skipping video attachment', [
                'plan_id' => $this->plan->id,
            ]);
        }

        // A refinement re-anchors due dates on now() rather than the plan's
        // original created_at, mirroring Plan::cloneForUser() — otherwise a
        // plan refined weeks after creation could get due dates in the past.
        $dueDateAnchor = $this->isRefinement ? now() : $this->plan->created_at;

        // Wrapped in a transaction so a mid-loop failure (e.g. a transient DB
        // error on one step) rolls back to the pre-refinement steps intact
        // rather than leaving the plan "ready" with a truncated step list.
        DB::transaction(function () use ($steps, $emoji, $videoService, $dueDateAnchor) {
            if ($this->isRefinement) {
                // Cascade-deletes each step's resources (step_resources.plan_step_id
                // is cascadeOnDelete()) — safe to replace wholesale rather
                // than diff against the new set.
                $this->plan->steps()->delete();
            }

            $videosRemaining = self::MAX_VIDEOS_PER_PLAN;
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
                    'due_date' => $dueDateAnchor->copy()->addDays($cumulativeDays),
                    'video_url' => $video['url'] ?? null,
                    'video_title' => $video['title'] ?? null,
                    'video_channel' => $video['channel'] ?? null,
                    'video_view_count' => $video['view_count'] ?? null,
                    'video_published_at' => $video['published_at'] ?? null,
                ]);
            }

            $this->plan->update(['status' => 'ready', 'emoji' => $emoji]);

            if ($this->isRefinement) {
                $this->plan->latestRefinement?->update(['status' => 'applied']);
            }
        });
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
     * @return array{type: 'steps', emoji: ?string, steps: array<int, array{title: string, description: string, estimated_days: int, needs_video: bool}>}|array{type: 'rejected', category: string, reason: ?string}
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
                                // Deliberately loose, and deliberately not
                                // derived from stepBudget(): the tools block is
                                // part of the cached prefix, so varying it per
                                // plan would blow the cache on every call. The
                                // real control is the exact count in the user
                                // message; this is only a backstop against a
                                // wildly malformed response. The floor is 1
                                // because a 2-day plan legitimately has 2 steps.
                                'minItems' => 1,
                                'maxItems' => self::MAX_STEPS,
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
                ], [
                    'name' => 'flag_unsupported_goal',
                    'description' => 'Call this instead of create_plan_steps when the stated goal is illegal, obscene/sexual, or gratuitously violent per the content policy, rather than a legitimate (even if edgy) goal.',
                    'input_schema' => [
                        'type' => 'object',
                        'properties' => [
                            'category' => [
                                'type' => 'string',
                                'enum' => self::REJECTION_CATEGORIES,
                            ],
                            'reason' => [
                                'type' => 'string',
                                'description' => 'One short internal sentence explaining the call. Not shown to the user verbatim.',
                            ],
                        ],
                        'required' => ['category', 'reason'],
                    ],
                ]],
                // "auto" rather than forcing create_plan_steps, so Claude can
                // call flag_unsupported_goal instead when the content policy
                // applies. Both tools are single-purpose, so "auto" won't
                // produce a plain-text reply we'd have to handle separately.
                'tool_choice' => ['type' => 'auto'],
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

        if (! $toolUse) {
            throw new RuntimeException('Anthropic response did not include a tool call.');
        }

        if ($toolUse['name'] === 'flag_unsupported_goal') {
            $category = $toolUse['input']['category'] ?? null;

            return [
                'type' => 'rejected',
                'category' => in_array($category, self::REJECTION_CATEGORIES, true)
                    ? $category
                    : self::FALLBACK_REJECTION_CATEGORY,
                'reason' => $toolUse['input']['reason'] ?? null,
            ];
        }

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

        // Individual steps can independently come back as JSON-encoded
        // strings rather than objects, even when the outer array didn't.
        $steps = collect($steps)
            ->map(fn ($step) => is_string($step) ? json_decode($step, true) : $step)
            ->filter(fn ($step) => is_array($step))
            ->values()
            ->all();

        if (empty($steps)) {
            throw new RuntimeException('Anthropic response did not include any usable steps.');
        }

        return ['type' => 'steps', 'emoji' => is_string($emoji) ? $emoji : null, 'steps' => $steps];
    }

    private function buildPrompt(): string
    {
        $totalDays = $this->plan->target_days ?? self::DEFAULT_TARGET_DAYS;
        $skillLevel = $this->plan->skill_level ?? 'unspecified';
        $timeCommitment = $this->plan->time_commitment ?? 'unspecified';
        $stepCount = $this->stepBudget();

        $prompt = <<<PROMPT
            Goal: "{$this->plan->original_prompt}"
            Skill level: {$skillLevel}
            Time commitment: {$timeCommitment}
            Target plan length: approximately {$totalDays} days total
            Number of steps: exactly {$stepCount}
            PROMPT;

        if (! $this->isRefinement) {
            return $prompt;
        }

        return $prompt."\n\n".$this->buildRefinementSection();
    }

    private function buildRefinementSection(): string
    {
        $currentSteps = $this->plan->steps
            ->map(fn ($step, $index) => ($index + 1).". \"{$step->title}\" ({$step->estimated_days} days) — {$step->description}")
            ->implode("\n");

        $refinement = $this->plan->latestRefinement;

        $requestedChanges = collect($refinement?->tags ?? [])
            ->map(fn ($tag) => self::TAG_INSTRUCTIONS[$tag] ?? null)
            ->filter();

        if ($refinement?->notes) {
            $requestedChanges->push($refinement->notes);
        }

        $requestedChangesList = $requestedChanges
            ->map(fn ($line) => "- {$line}")
            ->implode("\n");

        return <<<PROMPT
            Current plan steps:
            {$currentSteps}

            Requested changes:
            {$requestedChangesList}
            PROMPT;
    }

    public function failed(Throwable $exception): void
    {
        if ($this->isRefinement) {
            $this->abandonRefinement();

            return;
        }

        $this->plan->update([
            'status' => 'failed',
            'error_message' => $exception->getMessage(),
        ]);
    }

    /**
     * Backs out of a refinement without touching the plan.
     *
     * Whether the attempt was flagged by the content policy or died on an
     * exception, the outcome has to be the same: the user already had a
     * working plan, and losing it behind a dead-end "failed" screen (whose
     * only recovery path is starting a brand new plan) is worse than
     * reporting that this one attempt didn't take. Only the refinement
     * record is marked failed; the plan goes back to 'ready' with its
     * existing steps untouched.
     */
    private function abandonRefinement(): void
    {
        $this->plan->update(['status' => 'ready']);
        $this->plan->latestRefinement?->update(['status' => 'failed']);
    }
}

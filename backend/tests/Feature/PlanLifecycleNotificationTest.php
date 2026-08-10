<?php

namespace Tests\Feature;

use App\Jobs\GeneratePlanSteps;
use App\Models\Plan;
use App\Models\PushToken;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/**
 * The notifications a plan sends about itself.
 *
 * The whole reason this file exists is the shape of GeneratePlanSteps:
 * `status => 'ready'` is written in three different places, and only one
 * of them means the plan succeeded. The other two restore an existing
 * plan after a *failed* refinement. Anything keyed off the status column
 * alone would cheerfully announce "your plan is ready!" to someone whose
 * refinement just fell over.
 */
class PlanLifecycleNotificationTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        config([
            'services.anthropic.api_key' => 'test-key',
            'services.youtube.api_key' => null,
            'services.expo.enabled' => true,
        ]);
    }

    private function userWithDevice(): User
    {
        $user = User::factory()->create();

        PushToken::create([
            'user_id' => $user->id,
            'token' => 'tok-'.$user->id,
            'platform' => 'ios',
            'timezone' => 'UTC',
            'last_seen_at' => now(),
        ]);

        return $user;
    }

    private function makePlan(User $user, string $status = 'generating'): Plan
    {
        return Plan::create([
            'user_id' => $user->id,
            'title' => 'Learn Guitar',
            'original_prompt' => 'Learn guitar',
            'status' => $status,
            'skill_level' => 'beginner',
            'time_commitment' => 'moderate',
            'target_days' => 30,
        ]);
    }

    private function makeReadyPlanWithSteps(User $user): Plan
    {
        $plan = $this->makePlan($user, 'ready');

        $plan->steps()->create([
            'order' => 1,
            'title' => 'Original Step One',
            'description' => 'Do the first thing.',
            'estimated_days' => 5,
        ]);

        return $plan;
    }

    /**
     * Anthropic returns steps; Expo accepts the push. Two hosts, one fake
     * map — the Expo entry has to be here or the push would fall through
     * to a real request.
     */
    private function fakeGenerationAndPush(): void
    {
        Http::fake([
            'api.anthropic.com/*' => Http::response([
                'content' => [[
                    'type' => 'tool_use',
                    'name' => 'create_plan_steps',
                    'input' => [
                        'emoji' => '🎸',
                        'steps' => [
                            ['title' => 'Tune the guitar', 'description' => 'Get it in tune.', 'estimated_days' => 3],
                            ['title' => 'Learn a chord', 'description' => 'Start with G.', 'estimated_days' => 4],
                        ],
                    ],
                ]],
                'usage' => [],
            ]),
            'exp.host/*' => Http::response(['data' => [['status' => 'ok']]]),
        ]);
    }

    private function fakeRejectionAndPush(): void
    {
        Http::fake([
            'api.anthropic.com/*' => Http::response([
                'content' => [[
                    'type' => 'tool_use',
                    'name' => 'flag_unsupported_goal',
                    'input' => ['category' => 'illegal', 'reason' => 'test'],
                ]],
                'usage' => [],
            ]),
            'exp.host/*' => Http::response(['data' => [['status' => 'ok']]]),
        ]);
    }

    private function fakeGenerationFailureAndPush(): void
    {
        Http::fake([
            'api.anthropic.com/*' => Http::response(['error' => 'boom'], 500),
            'exp.host/*' => Http::response(['data' => [['status' => 'ok']]]),
        ]);
    }

    public function test_a_successful_generation_notifies_the_owner(): void
    {
        $user = $this->userWithDevice();
        $plan = $this->makePlan($user);
        $this->fakeGenerationAndPush();

        GeneratePlanSteps::dispatch($plan);

        $this->assertDatabaseHas('notification_deliveries', [
            'user_id' => $user->id,
            'type' => 'plan_ready',
            'dedupe_key' => 'plan:'.$plan->id,
        ]);
    }

    /**
     * The body is built from the steps, which only exist once the
     * transaction committed — proof the notification is sent after it,
     * not from inside.
     */
    public function test_the_ready_notification_describes_the_generated_steps(): void
    {
        $user = $this->userWithDevice();
        $plan = $this->makePlan($user);
        $this->fakeGenerationAndPush();

        GeneratePlanSteps::dispatch($plan);

        Http::assertSent(function ($request) {
            if (! str_contains($request->url(), 'exp.host')) {
                return false;
            }

            $message = $request->data()[0];

            return $message['title'] === '🎸 Learn Guitar is ready'
                && $message['body'] === '2 steps, starting with "Tune the guitar".';
        });
    }

    public function test_a_content_rejection_notifies_the_owner(): void
    {
        $user = $this->userWithDevice();
        $plan = $this->makePlan($user);
        $this->fakeRejectionAndPush();

        GeneratePlanSteps::dispatch($plan);

        $this->assertDatabaseHas('notification_deliveries', [
            'user_id' => $user->id,
            'type' => 'plan_rejected',
        ]);
    }

    public function test_a_terminal_failure_notifies_the_owner(): void
    {
        $user = $this->userWithDevice();
        $plan = $this->makePlan($user);
        $this->fakeGenerationFailureAndPush();

        try {
            GeneratePlanSteps::dispatch($plan);
        } catch (\Throwable) {
            // SyncQueue re-throws after calling failed() — see the same
            // pattern in GeneratePlanStepsRefinementTest.
        }

        $this->assertDatabaseHas('notification_deliveries', [
            'user_id' => $user->id,
            'type' => 'plan_failed',
        ]);
    }

    public function test_a_successful_refinement_says_reworked_not_ready(): void
    {
        $user = $this->userWithDevice();
        $plan = $this->makeReadyPlanWithSteps($user);
        $plan->refinements()->create(['tags' => ['no_equipment'], 'status' => 'pending']);
        $this->fakeGenerationAndPush();

        GeneratePlanSteps::dispatch($plan, isRefinement: true);

        $this->assertDatabaseHas('notification_deliveries', [
            'user_id' => $user->id,
            'type' => 'refinement_applied',
        ]);
        $this->assertDatabaseMissing('notification_deliveries', [
            'user_id' => $user->id,
            'type' => 'plan_ready',
        ]);
    }

    /**
     * The first of the two traps. A refinement whose requested changes get
     * content-flagged restores the plan to `ready` — the status column now
     * reads exactly as it does on success, but nothing succeeded.
     */
    public function test_a_content_flagged_refinement_does_not_claim_the_plan_is_ready(): void
    {
        $user = $this->userWithDevice();
        $plan = $this->makeReadyPlanWithSteps($user);
        $plan->refinements()->create(['tags' => ['no_equipment'], 'status' => 'pending']);
        $this->fakeRejectionAndPush();

        GeneratePlanSteps::dispatch($plan, isRefinement: true);

        $this->assertSame('ready', $plan->fresh()->status);
        $this->assertDatabaseMissing('notification_deliveries', [
            'user_id' => $user->id,
            'type' => 'plan_ready',
        ]);
        $this->assertDatabaseHas('notification_deliveries', [
            'user_id' => $user->id,
            'type' => 'refinement_failed',
        ]);
    }

    /**
     * The second trap, on the other path that restores `ready` — the
     * job crashing outright, handled in failed().
     */
    public function test_a_crashed_refinement_does_not_claim_the_plan_is_ready(): void
    {
        $user = $this->userWithDevice();
        $plan = $this->makeReadyPlanWithSteps($user);
        $plan->refinements()->create(['tags' => ['no_equipment'], 'status' => 'pending']);
        $this->fakeGenerationFailureAndPush();

        try {
            GeneratePlanSteps::dispatch($plan, isRefinement: true);
        } catch (\Throwable) {
            // Expected.
        }

        $this->assertSame('ready', $plan->fresh()->status);
        $this->assertDatabaseMissing('notification_deliveries', [
            'user_id' => $user->id,
            'type' => 'plan_ready',
        ]);
        $this->assertDatabaseHas('notification_deliveries', [
            'user_id' => $user->id,
            'type' => 'refinement_failed',
        ]);
    }

    /**
     * Featured plans are admin-curated and carry no owner, so generating
     * one must not try to notify anybody.
     */
    public function test_an_ownerless_plan_notifies_nobody(): void
    {
        $plan = Plan::create([
            'user_id' => null,
            'title' => 'Learn Guitar',
            'original_prompt' => 'Learn guitar',
            'status' => 'generating',
            'target_days' => 30,
        ]);
        $this->fakeGenerationAndPush();

        GeneratePlanSteps::dispatch($plan);

        $this->assertDatabaseCount('notification_deliveries', 0);
    }

    /**
     * Plan updates are transactional, so they're exempt from the daily
     * budget — but they still answer to their own category switch.
     */
    public function test_a_user_who_switched_off_plan_updates_gets_nothing(): void
    {
        $user = $this->userWithDevice();
        $user->update(['notify_plan_updates' => false]);
        $plan = $this->makePlan($user);
        $this->fakeGenerationAndPush();

        GeneratePlanSteps::dispatch($plan);

        $this->assertDatabaseCount('notification_deliveries', 0);
    }
}

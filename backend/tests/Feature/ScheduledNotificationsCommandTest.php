<?php

namespace Tests\Feature;

use App\Jobs\SendPushNotification;
use App\Models\Plan;
use App\Models\PushToken;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

/**
 * The hourly sender: who is due, what it decides to say, and the promise
 * that it never says more than one thing a day.
 */
class ScheduledNotificationsCommandTest extends TestCase
{
    use RefreshDatabase;

    protected function tearDown(): void
    {
        Carbon::setTestNow();

        parent::tearDown();
    }

    private function userWithDevice(array $attributes = [], string $timezone = 'UTC'): User
    {
        $user = User::factory()->create($attributes);

        PushToken::create([
            'user_id' => $user->id,
            'token' => 'tok-'.$user->id,
            'platform' => 'ios',
            'timezone' => $timezone,
            'last_seen_at' => Carbon::now(),
        ]);

        return $user;
    }

    private function makePlan(User $user, array $overrides = []): Plan
    {
        return Plan::create(array_merge([
            'user_id' => $user->id,
            'title' => 'Learn Guitar',
            'emoji' => '🎸',
            'original_prompt' => 'Learn guitar',
            'status' => 'ready',
            'target_days' => 30,
        ], $overrides));
    }

    /**
     * @param  array<int, array{title?: string, due_date?: ?string, completed_at?: ?string}>  $steps
     */
    private function addSteps(Plan $plan, array $steps): void
    {
        foreach ($steps as $index => $step) {
            $plan->steps()->create([
                'order' => $index + 1,
                'title' => $step['title'] ?? 'Step '.($index + 1),
                'description' => 'Do the thing.',
                'estimated_days' => 3,
                'due_date' => $step['due_date'] ?? null,
                'completed_at' => $step['completed_at'] ?? null,
            ]);
        }
    }

    /**
     * The command only acts at the user's local nudge hour, so every test
     * has to put the clock there first.
     */
    private function travelToNudgeHour(User $user, string $date = '2026-08-10'): void
    {
        Carbon::setTestNow(
            Carbon::parse($date.' 00:00:00', $user->timezone())->setHour($user->daily_nudge_hour)->utc()
        );
    }

    private function lastPushedBody(): ?string
    {
        $job = null;
        Queue::assertPushed(SendPushNotification::class, function ($pushed) use (&$job) {
            $job = $pushed;

            return true;
        });

        return $job?->body;
    }

    private function lastPushedTitle(): ?string
    {
        $job = null;
        Queue::assertPushed(SendPushNotification::class, function ($pushed) use (&$job) {
            $job = $pushed;

            return true;
        });

        return $job?->title;
    }

    public function test_it_nudges_about_a_step_due_today(): void
    {
        Queue::fake();
        $user = $this->userWithDevice();
        $this->travelToNudgeHour($user);
        $plan = $this->makePlan($user);
        // Three steps, not one: a plan with a single outstanding step also
        // qualifies for "one step left", which outranks the daily nudge
        // and would quietly be what this asserted on.
        $this->addSteps($plan, [
            ['title' => 'Tune the guitar', 'due_date' => '2026-08-10'],
            ['title' => 'Learn a chord'],
            ['title' => 'Play a song'],
        ]);

        $this->artisan('notifications:scheduled')->assertSuccessful();

        $this->assertSame('One step to tackle today', $this->lastPushedTitle());
        $this->assertSame('Tune the guitar', $this->lastPushedBody());
    }

    public function test_it_counts_multiple_steps_due_today(): void
    {
        Queue::fake();
        $user = $this->userWithDevice();
        $this->travelToNudgeHour($user);
        $plan = $this->makePlan($user);
        $this->addSteps($plan, [
            ['due_date' => '2026-08-10'],
            ['due_date' => '2026-08-10'],
        ]);

        $this->artisan('notifications:scheduled');

        $this->assertSame('2 steps to tackle today', $this->lastPushedTitle());
    }

    /**
     * Due-today and overdue are one thought, not two competing ones —
     * someone with both must hear about both.
     */
    public function test_overdue_steps_are_folded_into_the_due_today_message(): void
    {
        Queue::fake();
        $user = $this->userWithDevice();
        $this->travelToNudgeHour($user);
        $plan = $this->makePlan($user);
        $this->addSteps($plan, [
            ['due_date' => '2026-08-10'],
            ['due_date' => '2026-08-01'],
            ['due_date' => '2026-08-02'],
        ]);

        $this->artisan('notifications:scheduled');

        $this->assertSame('One step to tackle today', $this->lastPushedTitle());
        $this->assertSame('2 more are past due.', $this->lastPushedBody());
    }

    public function test_it_nudges_about_overdue_steps_when_nothing_is_due_today(): void
    {
        Queue::fake();
        $user = $this->userWithDevice();
        $this->travelToNudgeHour($user);
        $plan = $this->makePlan($user);
        $this->addSteps($plan, [['due_date' => '2026-08-01']]);

        $this->artisan('notifications:scheduled');

        $this->assertSame('One step is past due', $this->lastPushedTitle());
    }

    public function test_completed_steps_are_not_nudged_about(): void
    {
        Queue::fake();
        $user = $this->userWithDevice();
        $this->travelToNudgeHour($user);
        $plan = $this->makePlan($user);
        $this->addSteps($plan, [['due_date' => '2026-08-10', 'completed_at' => '2026-08-09 10:00:00']]);

        $this->artisan('notifications:scheduled');

        Queue::assertNothingPushed();
    }

    public function test_steps_in_a_finished_plan_are_not_nudged_about(): void
    {
        Queue::fake();
        $user = $this->userWithDevice();
        $this->travelToNudgeHour($user);
        $plan = $this->makePlan($user, ['completed_at' => '2026-08-09 10:00:00']);
        $this->addSteps($plan, [['due_date' => '2026-08-10']]);

        $this->artisan('notifications:scheduled');

        Queue::assertNothingPushed();
    }

    public function test_nothing_is_sent_outside_the_users_nudge_hour(): void
    {
        Queue::fake();
        $user = $this->userWithDevice();
        Carbon::setTestNow(Carbon::parse('2026-08-10 00:00:00', 'UTC')->setHour($user->daily_nudge_hour + 3));
        $plan = $this->makePlan($user);
        $this->addSteps($plan, [['due_date' => '2026-08-10']]);

        $this->artisan('notifications:scheduled');

        Queue::assertNothingPushed();
    }

    /**
     * The nudge hour is the user's own. 14:00 UTC is 10am in Detroit and
     * 11pm in Tokyo, so only one of these two users is due.
     */
    public function test_the_nudge_hour_is_evaluated_in_the_devices_timezone(): void
    {
        Queue::fake();
        Carbon::setTestNow(Carbon::parse('2026-08-10 14:00:00', 'UTC'));

        $detroit = $this->userWithDevice(['daily_nudge_hour' => 10], 'America/Detroit');
        $tokyo = $this->userWithDevice(['daily_nudge_hour' => 10], 'Asia/Tokyo');

        foreach ([$detroit, $tokyo] as $user) {
            $plan = $this->makePlan($user);
            $this->addSteps($plan, [['due_date' => '2026-08-10']]);
        }

        $this->artisan('notifications:scheduled');

        Queue::assertPushed(SendPushNotification::class, 1);
        Queue::assertPushed(
            SendPushNotification::class,
            fn ($job) => $job->tokens === ['tok-'.$detroit->id]
        );
    }

    public function test_a_user_with_no_device_is_skipped(): void
    {
        Queue::fake();
        $user = User::factory()->create();
        Carbon::setTestNow(Carbon::parse('2026-08-10 09:00:00', 'UTC'));
        $plan = $this->makePlan($user);
        $this->addSteps($plan, [['due_date' => '2026-08-10']]);

        $this->artisan('notifications:scheduled');

        Queue::assertNothingPushed();
    }

    /**
     * The budget's whole point: several things can be true at once, and
     * the user still hears from the app exactly once.
     */
    public function test_only_one_notification_goes_out_even_when_several_qualify(): void
    {
        Queue::fake();
        $user = $this->userWithDevice();
        $this->travelToNudgeHour($user);

        $due = $this->makePlan($user, ['title' => 'Learn Guitar']);
        $this->addSteps($due, [['due_date' => '2026-08-10']]);

        $halfway = $this->makePlan($user, ['title' => 'Learn Spanish']);
        $this->addSteps($halfway, [
            ['completed_at' => '2026-08-05 10:00:00'],
            ['completed_at' => '2026-08-06 10:00:00'],
            [],
            [],
        ]);

        $this->artisan('notifications:scheduled');

        Queue::assertPushed(SendPushNotification::class, 1);
    }

    /**
     * The lower-priority item still gets said — as a clause on the end of
     * the headline, rather than being silently dropped.
     */
    public function test_a_second_qualifying_item_is_appended_as_a_clause(): void
    {
        Queue::fake();
        $user = $this->userWithDevice();
        $this->travelToNudgeHour($user);

        $due = $this->makePlan($user, ['title' => 'Learn Guitar']);
        $this->addSteps($due, [['title' => 'Tune up', 'due_date' => '2026-08-10'], [], []]);

        $halfway = $this->makePlan($user, ['title' => 'Learn Spanish']);
        $this->addSteps($halfway, [
            ['completed_at' => '2026-08-05 10:00:00'],
            ['completed_at' => '2026-08-06 10:00:00'],
            [],
            [],
        ]);

        $this->artisan('notifications:scheduled');

        $this->assertSame('Tune up Learn Spanish is halfway done.', $this->lastPushedBody());
    }

    /**
     * A milestone that only appeared as a clause must be recorded, or it
     * would headline its own notification tomorrow — the user would hear
     * the same fact twice.
     */
    public function test_a_folded_in_item_is_recorded_as_delivered(): void
    {
        Queue::fake();
        $user = $this->userWithDevice();
        $this->travelToNudgeHour($user);

        $due = $this->makePlan($user, ['title' => 'Learn Guitar']);
        $this->addSteps($due, [['due_date' => '2026-08-10'], [], []]);

        $halfway = $this->makePlan($user, ['title' => 'Learn Spanish']);
        $this->addSteps($halfway, [
            ['completed_at' => '2026-08-05 10:00:00'],
            ['completed_at' => '2026-08-06 10:00:00'],
            [],
            [],
        ]);

        $this->artisan('notifications:scheduled');

        $this->assertDatabaseHas('notification_deliveries', [
            'user_id' => $user->id,
            'type' => 'plan_halfway',
            'dedupe_key' => 'plan:'.$halfway->id,
        ]);
    }

    /**
     * A plan on its last step is also past halfway. Saying both about the
     * same plan in one message reads like a bug.
     */
    public function test_a_plan_on_its_last_step_does_not_also_report_halfway(): void
    {
        Queue::fake();
        $user = $this->userWithDevice();
        $this->travelToNudgeHour($user);

        $plan = $this->makePlan($user);
        $this->addSteps($plan, [
            ['completed_at' => '2026-08-05 10:00:00'],
            ['title' => 'Last one'],
        ]);

        $this->artisan('notifications:scheduled');

        $this->assertSame('One step left in Learn Guitar', $this->lastPushedTitle());
        $this->assertDatabaseMissing('notification_deliveries', ['type' => 'plan_halfway']);
    }

    public function test_a_halfway_plan_is_only_ever_reported_once(): void
    {
        Queue::fake();
        $user = $this->userWithDevice();
        $plan = $this->makePlan($user);
        $this->addSteps($plan, [
            ['completed_at' => '2026-08-05 10:00:00'],
            ['completed_at' => '2026-08-06 10:00:00'],
            [],
            [],
        ]);

        $this->travelToNudgeHour($user, '2026-08-10');
        $this->artisan('notifications:scheduled');

        $this->travelToNudgeHour($user, '2026-08-11');
        $this->artisan('notifications:scheduled');

        Queue::assertPushed(SendPushNotification::class, 1);
    }

    public function test_it_celebrates_a_streak_milestone(): void
    {
        Queue::fake();
        $user = $this->userWithDevice();
        $plan = $this->makePlan($user);

        // Seven consecutive days ending yesterday (2026-08-03 .. 2026-08-09).
        $steps = [];
        for ($i = 7; $i >= 1; $i--) {
            $steps[] = ['completed_at' => Carbon::parse('2026-08-10')->subDays($i)->setHour(12)->toDateTimeString()];
        }
        // Two outstanding steps, so the plan doesn't also qualify for
        // "one step left" and outrank the milestone.
        $steps[] = [];
        $steps[] = [];
        $this->addSteps($plan, $steps);

        $this->travelToNudgeHour($user, '2026-08-10');
        $this->artisan('notifications:scheduled');

        $this->assertSame('7-day streak', $this->lastPushedTitle());
    }

    /**
     * A streak that already includes today isn't at risk and its milestone
     * was reported this morning — there's nothing left to say about it.
     */
    public function test_a_streak_already_extended_today_is_not_mentioned(): void
    {
        Queue::fake();
        $user = $this->userWithDevice();
        $plan = $this->makePlan($user);
        $this->addSteps($plan, [
            ['completed_at' => '2026-08-08 12:00:00'],
            ['completed_at' => '2026-08-09 12:00:00'],
            ['completed_at' => '2026-08-10 07:00:00'],
            [],
        ]);

        $this->travelToNudgeHour($user, '2026-08-10');
        $this->artisan('notifications:scheduled');

        $this->assertDatabaseMissing('notification_deliveries', ['type' => 'streak_at_risk']);
        $this->assertDatabaseMissing('notification_deliveries', ['type' => 'streak_milestone']);
    }

    public function test_the_weekly_recap_only_goes_out_on_sunday(): void
    {
        Queue::fake();
        $user = $this->userWithDevice();
        $plan = $this->makePlan($user);
        $this->addSteps($plan, [['completed_at' => '2026-08-07 12:00:00'], [], []]);

        // 2026-08-10 is a Monday.
        $this->travelToNudgeHour($user, '2026-08-10');
        $this->artisan('notifications:scheduled');

        $this->assertDatabaseMissing('notification_deliveries', ['type' => 'weekly_recap']);

        // 2026-08-09 is the Sunday before it.
        Carbon::setTestNow(null);
        $this->travelToNudgeHour($user, '2026-08-09');
        $this->artisan('notifications:scheduled');

        $this->assertDatabaseHas('notification_deliveries', ['type' => 'weekly_recap']);
    }

    /**
     * A lifetime entitlement reports a null expiry, which must never be
     * read as "expiring" — see User::hasActiveSubscription().
     */
    public function test_a_lifetime_subscription_is_never_reported_as_expiring(): void
    {
        Queue::fake();
        $user = $this->userWithDevice([
            'subscription_tier' => 'pro',
            'subscription_expires_at' => null,
        ]);
        $this->travelToNudgeHour($user);

        $this->artisan('notifications:scheduled');

        $this->assertDatabaseMissing('notification_deliveries', ['type' => 'subscription_expiring']);
    }

    public function test_it_warns_about_a_subscription_ending_soon(): void
    {
        Queue::fake();
        $user = $this->userWithDevice([
            'subscription_tier' => 'pro',
            'subscription_expires_at' => '2026-08-12 09:00:00',
        ]);
        $this->travelToNudgeHour($user);

        $this->artisan('notifications:scheduled');

        $this->assertDatabaseHas('notification_deliveries', ['type' => 'subscription_expiring']);
    }

    public function test_it_reminds_an_unverified_user_to_confirm_their_email(): void
    {
        Queue::fake();
        $user = $this->userWithDevice(['email_verified_at' => null]);
        $user->forceFill(['created_at' => '2026-08-08 09:00:00'])->save();
        $this->travelToNudgeHour($user);

        $this->artisan('notifications:scheduled');

        $this->assertDatabaseHas('notification_deliveries', ['type' => 'verify_email_reminder']);
    }

    public function test_a_brand_new_unverified_user_is_left_alone(): void
    {
        Queue::fake();
        $user = $this->userWithDevice(['email_verified_at' => null]);
        $this->travelToNudgeHour($user);

        $this->artisan('notifications:scheduled');

        $this->assertDatabaseMissing('notification_deliveries', ['type' => 'verify_email_reminder']);
    }

    public function test_a_user_who_switched_off_reminders_hears_nothing(): void
    {
        Queue::fake();
        $user = $this->userWithDevice(['notify_reminders' => false]);
        $this->travelToNudgeHour($user);
        $plan = $this->makePlan($user);
        $this->addSteps($plan, [['due_date' => '2026-08-10']]);

        $this->artisan('notifications:scheduled');

        Queue::assertNothingPushed();
    }

    /**
     * A switched-off category must not be able to speak through somebody
     * else's notification as a clause.
     */
    public function test_a_switched_off_category_is_not_folded_in_as_a_clause(): void
    {
        Queue::fake();
        $user = $this->userWithDevice(['notify_progress' => false]);
        $this->travelToNudgeHour($user);

        $due = $this->makePlan($user, ['title' => 'Learn Guitar']);
        $this->addSteps($due, [['title' => 'Tune up', 'due_date' => '2026-08-10']]);

        $halfway = $this->makePlan($user, ['title' => 'Learn Spanish']);
        $this->addSteps($halfway, [
            ['completed_at' => '2026-08-05 10:00:00'],
            ['completed_at' => '2026-08-06 10:00:00'],
            [],
            [],
        ]);

        $this->artisan('notifications:scheduled');

        $this->assertSame('Tune up', $this->lastPushedBody());
    }

    public function test_nothing_is_sent_when_there_is_nothing_to_say(): void
    {
        Queue::fake();
        $user = $this->userWithDevice();
        $this->travelToNudgeHour($user);

        $this->artisan('notifications:scheduled');

        Queue::assertNothingPushed();
    }

    /**
     * `--user` exists so the command can be exercised by hand without
     * waiting for the right hour to come around.
     */
    public function test_the_user_option_bypasses_the_nudge_hour(): void
    {
        Queue::fake();
        $user = $this->userWithDevice();
        Carbon::setTestNow(Carbon::parse('2026-08-10 14:00:00', 'UTC'));
        $plan = $this->makePlan($user);
        $this->addSteps($plan, [['due_date' => '2026-08-10']]);

        $this->artisan('notifications:scheduled', ['--user' => $user->id]);

        Queue::assertPushed(SendPushNotification::class, 1);
    }
}

<?php

namespace Tests\Feature;

use App\Enums\NotificationType;
use App\Jobs\SendPushNotification;
use App\Models\NotificationDelivery;
use App\Models\PushToken;
use App\Models\User;
use App\Services\PushNotificationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

class PushNotificationServiceTest extends TestCase
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

    private function service(): PushNotificationService
    {
        return app(PushNotificationService::class);
    }

    /**
     * Puts the clock inside quiet hours in the given zone so the
     * non-transactional tests aren't silently passing/failing on whatever
     * time of day the suite happens to run.
     */
    private function travelToLocalHour(int $hour, string $timezone = 'UTC'): void
    {
        Carbon::setTestNow(Carbon::parse('2026-08-10 12:00:00', $timezone)->setHour($hour)->utc());
    }

    public function test_it_queues_a_push_for_a_user_with_a_device(): void
    {
        Queue::fake();
        $this->travelToLocalHour(10);
        $user = $this->userWithDevice();

        $sent = $this->service()->send($user, NotificationType::StepsDueToday, 'Title', 'Body');

        $this->assertTrue($sent);
        Queue::assertPushed(SendPushNotification::class, fn ($job) => $job->tokens === ['tok-'.$user->id]
            && $job->title === 'Title'
            && $job->body === 'Body');
    }

    public function test_it_records_the_delivery(): void
    {
        Queue::fake();
        $this->travelToLocalHour(10);
        $user = $this->userWithDevice();

        $this->service()->send($user, NotificationType::StepsDueToday, 'Title', 'Body', dedupeKey: 'day:2026-08-10');

        $this->assertDatabaseHas('notification_deliveries', [
            'user_id' => $user->id,
            'type' => 'steps_due_today',
            'dedupe_key' => 'day:2026-08-10',
        ]);
    }

    public function test_it_sends_nothing_to_a_user_with_no_devices(): void
    {
        Queue::fake();
        $this->travelToLocalHour(10);
        $user = User::factory()->create();

        $sent = $this->service()->send($user, NotificationType::StepsDueToday, 'Title', 'Body');

        $this->assertFalse($sent);
        Queue::assertNothingPushed();
        // No device means nothing was sent, so nothing may be recorded —
        // otherwise the budget would be spent on a message nobody got, and
        // registering a device later would start the day already used up.
        $this->assertDatabaseCount('notification_deliveries', 0);
    }

    public function test_a_switched_off_category_blocks_the_send(): void
    {
        Queue::fake();
        $this->travelToLocalHour(10);
        $user = $this->userWithDevice(['notify_reminders' => false]);

        $sent = $this->service()->send($user, NotificationType::StepsDueToday, 'Title', 'Body');

        $this->assertFalse($sent);
        Queue::assertNothingPushed();
    }

    /**
     * Categories are independent: switching off reminders must not cost
     * someone the transactional "your plan is ready" message, which is the
     * whole reason the preferences aren't one master switch.
     */
    public function test_switching_off_one_category_leaves_the_others_alone(): void
    {
        Queue::fake();
        $this->travelToLocalHour(10);
        $user = $this->userWithDevice(['notify_reminders' => false]);

        $sent = $this->service()->send($user, NotificationType::PlanReady, 'Ready', 'Body');

        $this->assertTrue($sent);
        Queue::assertPushed(SendPushNotification::class);
    }

    public function test_the_same_dedupe_key_is_only_ever_sent_once(): void
    {
        Queue::fake();
        $this->travelToLocalHour(10);
        $user = $this->userWithDevice();

        $first = $this->service()->send($user, NotificationType::PlanHalfway, 'A', 'B', dedupeKey: 'plan:42');
        $second = $this->service()->send($user, NotificationType::PlanHalfway, 'A', 'B', dedupeKey: 'plan:42');

        $this->assertTrue($first);
        $this->assertFalse($second);
        Queue::assertPushed(SendPushNotification::class, 1);
    }

    /**
     * A null dedupe key means "this type is allowed to repeat" — the daily
     * nudge has to be able to fire again tomorrow. NULLs compare as
     * distinct in the unique index, which is what allows that.
     */
    public function test_a_null_dedupe_key_does_not_collide_with_itself(): void
    {
        Queue::fake();
        $user = $this->userWithDevice();

        $this->travelToLocalHour(10);
        $first = $this->service()->send($user, NotificationType::PlanReady, 'A', 'B');
        $second = $this->service()->send($user, NotificationType::PlanReady, 'A', 'B');

        $this->assertTrue($first);
        $this->assertTrue($second);
    }

    public function test_the_budget_blocks_a_second_send_on_the_same_day(): void
    {
        Queue::fake();
        $this->travelToLocalHour(10);
        $user = $this->userWithDevice();

        $first = $this->service()->send($user, NotificationType::StepsDueToday, 'A', 'B');
        $second = $this->service()->send($user, NotificationType::PlanHalfway, 'C', 'D');

        $this->assertTrue($first);
        $this->assertFalse($second);
        Queue::assertPushed(SendPushNotification::class, 1);
    }

    /**
     * The budget is a cap on how often the app speaks, not a cap per
     * topic — so it spans categories. Progress must not get its own
     * daily slot just because Reminders already used one.
     */
    public function test_the_budget_spans_categories(): void
    {
        Queue::fake();
        $this->travelToLocalHour(10);
        $user = $this->userWithDevice();

        $this->service()->send($user, NotificationType::StepsDueToday, 'A', 'B');
        $sent = $this->service()->send($user, NotificationType::SubscriptionExpiring, 'C', 'D');

        $this->assertFalse($sent);
    }

    /**
     * Someone who tapped "create plan" and backgrounded the app is waiting
     * for exactly one message. Holding it until tomorrow because they
     * already got a nudge this morning would look like the app broke.
     */
    public function test_transactional_types_ignore_the_budget(): void
    {
        Queue::fake();
        $this->travelToLocalHour(10);
        $user = $this->userWithDevice();

        $this->service()->send($user, NotificationType::StepsDueToday, 'A', 'B');
        $sent = $this->service()->send($user, NotificationType::PlanReady, 'Ready', 'D');

        $this->assertTrue($sent);
        Queue::assertPushed(SendPushNotification::class, 2);
    }

    public function test_quiet_hours_block_an_early_morning_send(): void
    {
        Queue::fake();
        $this->travelToLocalHour(6);
        $user = $this->userWithDevice();

        $sent = $this->service()->send($user, NotificationType::StepsDueToday, 'A', 'B');

        $this->assertFalse($sent);
    }

    public function test_quiet_hours_block_a_late_night_send(): void
    {
        Queue::fake();
        $this->travelToLocalHour(22);
        $user = $this->userWithDevice();

        $sent = $this->service()->send($user, NotificationType::StepsDueToday, 'A', 'B');

        $this->assertFalse($sent);
    }

    public function test_transactional_types_ignore_quiet_hours(): void
    {
        Queue::fake();
        $this->travelToLocalHour(3);
        $user = $this->userWithDevice();

        $sent = $this->service()->send($user, NotificationType::PlanReady, 'Ready', 'B');

        $this->assertTrue($sent);
    }

    /**
     * Quiet hours are the *user's*, not the server's. 3am UTC is 10pm the
     * previous evening in Detroit — inside quiet hours there, outside them
     * if you read the server clock instead.
     */
    public function test_quiet_hours_are_evaluated_in_the_devices_timezone(): void
    {
        Queue::fake();
        Carbon::setTestNow(Carbon::parse('2026-08-10 14:00:00', 'UTC'));

        $detroit = $this->userWithDevice(timezone: 'America/Detroit'); // 10am local
        $tokyo = $this->userWithDevice(timezone: 'Asia/Tokyo');        // 11pm local

        $this->assertTrue($this->service()->send($detroit, NotificationType::StepsDueToday, 'A', 'B'));
        $this->assertFalse($this->service()->send($tokyo, NotificationType::StepsDueToday, 'A', 'B'));
    }

    /**
     * Collapsing folds several qualifying types into one message. Each one
     * mentioned has to be recorded, or a milestone that appeared as a
     * secondary clause would headline its own notification tomorrow.
     */
    public function test_it_records_types_folded_in_by_collapsing(): void
    {
        Queue::fake();
        $this->travelToLocalHour(10);
        $user = $this->userWithDevice();

        $this->service()->send(
            $user,
            NotificationType::StepsDueToday,
            'A',
            'B',
            alsoRecord: [[NotificationType::PlanHalfway, 'plan:42']],
        );

        $this->assertDatabaseHas('notification_deliveries', [
            'user_id' => $user->id,
            'type' => 'plan_halfway',
            'dedupe_key' => 'plan:42',
        ]);
    }

    /**
     * The delivery row is written before the job is dispatched, so two
     * concurrent scheduler runs can't both pass the checks and both send.
     * Simulated here by pre-claiming the row the way the loser of that race
     * would find it.
     */
    public function test_a_pre_existing_delivery_row_prevents_a_duplicate_send(): void
    {
        Queue::fake();
        $this->travelToLocalHour(10);
        $user = $this->userWithDevice();

        NotificationDelivery::create([
            'user_id' => $user->id,
            'type' => NotificationType::PlanHalfway->value,
            'dedupe_key' => 'plan:42',
            'sent_at' => Carbon::now(),
        ]);

        $sent = $this->service()->send($user, NotificationType::PlanHalfway, 'A', 'B', dedupeKey: 'plan:42');

        $this->assertFalse($sent);
        Queue::assertNothingPushed();
    }
}

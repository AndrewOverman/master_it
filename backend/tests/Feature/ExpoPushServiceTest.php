<?php

namespace Tests\Feature;

use App\Models\PushToken;
use App\Models\User;
use App\Services\ExpoPushService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class ExpoPushServiceTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        config(['services.expo.enabled' => true, 'services.expo.access_token' => null]);
    }

    /**
     * Expo answers with one ticket per message, in the order sent.
     *
     * @param  array<int, array<string, mixed>>  $tickets
     */
    private function fakeExpoPush(array $tickets = [['status' => 'ok']]): void
    {
        Http::fake(['exp.host/*' => Http::response(['data' => $tickets])]);
    }

    private function service(): ExpoPushService
    {
        return app(ExpoPushService::class);
    }

    public function test_it_posts_a_message_per_token(): void
    {
        $this->fakeExpoPush([['status' => 'ok'], ['status' => 'ok']]);

        $this->service()->send(['tok-a', 'tok-b'], 'Title', 'Body', ['planId' => 7]);

        Http::assertSent(function (Request $request) {
            $messages = $request->data();

            return count($messages) === 2
                && $messages[0]['to'] === 'tok-a'
                && $messages[0]['title'] === 'Title'
                && $messages[0]['body'] === 'Body'
                && $messages[0]['data'] === ['planId' => 7]
                && $messages[1]['to'] === 'tok-b';
        });
    }

    /**
     * Expo rejects a request carrying more than 100 messages outright, so
     * a user base larger than one chunk has to be split or nothing sends.
     */
    public function test_it_chunks_recipients_at_one_hundred(): void
    {
        $this->fakeExpoPush();

        $tokens = array_map(fn (int $i) => "tok-{$i}", range(1, 250));

        $this->service()->send($tokens, 'Title', 'Body');

        Http::assertSentCount(3);
    }

    /**
     * A `categoryId` of null is filtered out rather than sent — Expo
     * rejects the message if the key is present but null.
     */
    public function test_it_omits_category_id_when_there_are_no_actions(): void
    {
        $this->fakeExpoPush();

        $this->service()->send(['tok-a'], 'Title', 'Body');

        Http::assertSent(fn (Request $request) => ! array_key_exists('categoryId', $request->data()[0]));
    }

    public function test_it_sends_category_id_when_given_one(): void
    {
        $this->fakeExpoPush();

        $this->service()->send(['tok-a'], 'Title', 'Body', [], 'step_reminder');

        Http::assertSent(fn (Request $request) => $request->data()[0]['categoryId'] === 'step_reminder');
    }

    /**
     * A DeviceNotRegistered ticket means the app was uninstalled or the
     * token rotated. That token can never deliver again, so leaving it in
     * place would mean paying to fail on every future send.
     */
    public function test_it_deletes_tokens_expo_reports_as_unregistered(): void
    {
        $user = User::factory()->create();
        PushToken::create(['user_id' => $user->id, 'token' => 'tok-dead', 'platform' => 'ios']);
        PushToken::create(['user_id' => $user->id, 'token' => 'tok-live', 'platform' => 'ios']);

        $this->fakeExpoPush([
            ['status' => 'error', 'details' => ['error' => 'DeviceNotRegistered']],
            ['status' => 'ok'],
        ]);

        $this->service()->send(['tok-dead', 'tok-live'], 'Title', 'Body');

        $this->assertDatabaseMissing('push_tokens', ['token' => 'tok-dead']);
        $this->assertDatabaseHas('push_tokens', ['token' => 'tok-live']);
    }

    /**
     * Other Expo errors (MessageTooBig, MessageRateExceeded) are about the
     * message, not the device — deleting the token over one would silently
     * unsubscribe someone who did nothing wrong.
     */
    public function test_it_keeps_tokens_for_errors_that_are_not_about_the_device(): void
    {
        $user = User::factory()->create();
        PushToken::create(['user_id' => $user->id, 'token' => 'tok-a', 'platform' => 'ios']);

        $this->fakeExpoPush([['status' => 'error', 'details' => ['error' => 'MessageRateExceeded']]]);

        $this->service()->send(['tok-a'], 'Title', 'Body');

        $this->assertDatabaseHas('push_tokens', ['token' => 'tok-a']);
    }

    public function test_it_sends_nothing_when_push_is_disabled(): void
    {
        config(['services.expo.enabled' => false]);
        Http::fake();

        $this->service()->send(['tok-a'], 'Title', 'Body');

        Http::assertNothingSent();
    }

    public function test_it_sends_nothing_when_there_are_no_tokens(): void
    {
        Http::fake();

        $this->service()->send([], 'Title', 'Body');

        Http::assertNothingSent();
    }

    public function test_it_authenticates_when_an_access_token_is_configured(): void
    {
        config(['services.expo.access_token' => 'secret-token']);
        $this->fakeExpoPush();

        $this->service()->send(['tok-a'], 'Title', 'Body');

        Http::assertSent(fn (Request $request) => $request->hasHeader('Authorization', 'Bearer secret-token'));
    }

    /**
     * Expo being down must not take the caller with it — a failed push is
     * logged and swallowed, never thrown into a queued job that would then
     * retry the whole plan generation around it.
     */
    public function test_it_swallows_a_failed_request(): void
    {
        Http::fake(['exp.host/*' => Http::response([], 500)]);

        $this->service()->send(['tok-a'], 'Title', 'Body');

        $this->assertTrue(true);
    }
}

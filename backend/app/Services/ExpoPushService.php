<?php

namespace App\Services;

use App\Models\PushToken;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Delivers to Expo's push service, which fans out to APNs and FCM on our
 * behalf.
 *
 * Going through Expo rather than talking to Apple and Google directly is
 * what keeps this to one HTTP call and no certificate handling — the app
 * is an Expo build, so the tokens it hands us are Expo's to begin with.
 */
class ExpoPushService
{
    private const PUSH_URL = 'https://exp.host/--/api/v2/push/send';

    /**
     * Expo rejects requests carrying more than 100 messages.
     */
    private const CHUNK_SIZE = 100;

    /**
     * Off by default so dev and staging don't send real pushes to whatever
     * devices happen to be registered against a shared database, and so
     * tests can assert that nothing goes out. Mirrors how the RevenueCat
     * secret key degrades the refresh endpoint to a no-op when unset.
     */
    public function isConfigured(): bool
    {
        return (bool) config('services.expo.enabled');
    }

    /**
     * Sends one message to many tokens.
     *
     * @param  array<int, string>  $tokens
     * @param  array<string, mixed>  $data  Deep-link payload, read by the app on tap.
     */
    public function send(
        array $tokens,
        string $title,
        string $body,
        array $data = [],
        ?string $categoryId = null,
    ): void {
        if (! $this->isConfigured() || $tokens === []) {
            return;
        }

        foreach (array_chunk($tokens, self::CHUNK_SIZE) as $chunk) {
            $messages = array_map(fn (string $token) => array_filter([
                'to' => $token,
                'title' => $title,
                'body' => $body,
                'data' => $data,
                'sound' => 'default',
                // Drives the action buttons ("Mark done" / "Snooze") the
                // app registers for this category. Null for types with no
                // actions, and filtered out rather than sent as null
                // because Expo rejects an explicit null here.
                'categoryId' => $categoryId,
            ], fn ($value) => $value !== null), $chunk);

            $this->deliver($messages);
        }
    }

    /**
     * @param  array<int, array<string, mixed>>  $messages
     */
    private function deliver(array $messages): void
    {
        // throw: false because a push that can't be delivered is not worth
        // failing the caller over — this runs inside a queued job that has
        // usually already done the expensive, user-visible work (generating
        // a plan), and re-running that to retry a notification would be a
        // far worse outcome than a missed one.
        $request = Http::acceptJson()->timeout(15)->retry(2, 1000, throw: false);

        // Optional on Expo's side. Worth setting in production: without it,
        // anyone who learns a token can push to that device.
        if ($accessToken = config('services.expo.access_token')) {
            $request = $request->withToken($accessToken);
        }

        $response = $request->post(self::PUSH_URL, $messages);

        if ($response->failed()) {
            Log::warning('ExpoPushService: push request failed', [
                'status' => $response->status(),
                'body' => $response->body(),
            ]);

            return;
        }

        $this->pruneDeadTokens($messages, $response->json('data') ?? []);
    }

    /**
     * Expo returns one ticket per message, in order. A ticket with
     * `DeviceNotRegistered` means the app was uninstalled or the token was
     * rotated — that token will never deliver again, so keeping it only
     * means paying to fail on every future send.
     *
     * @param  array<int, array<string, mixed>>  $messages
     * @param  array<int, array<string, mixed>>  $tickets
     */
    private function pruneDeadTokens(array $messages, array $tickets): void
    {
        $dead = [];

        foreach ($tickets as $index => $ticket) {
            if (($ticket['status'] ?? null) !== 'error') {
                continue;
            }

            if (($ticket['details']['error'] ?? null) === 'DeviceNotRegistered'
                && isset($messages[$index]['to'])) {
                $dead[] = $messages[$index]['to'];
            }
        }

        if ($dead !== []) {
            PushToken::whereIn('token', $dead)->delete();
        }
    }
}

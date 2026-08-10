<?php

namespace App\Jobs;

use App\Services\ExpoPushService;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

/**
 * Queued for the same reason VerifyEmail is: sending is an HTTP round trip
 * to a third party, and neither a plan finishing generation nor the hourly
 * scheduler should wait on Expo — or fail because Expo is having a bad
 * afternoon.
 *
 * Takes raw token strings rather than a User, so the recipient set is
 * whatever PushNotificationService resolved at decision time. A device
 * that unregisters between queueing and delivery is handled at the far
 * end, where Expo tells us the token is dead.
 */
class SendPushNotification implements ShouldQueue
{
    use Queueable;

    /**
     * @param  array<int, string>  $tokens
     * @param  array<string, mixed>  $data
     */
    public function __construct(
        public array $tokens,
        public string $title,
        public string $body,
        public array $data = [],
        public ?string $categoryId = null,
    ) {}

    public function handle(ExpoPushService $expo): void
    {
        $expo->send($this->tokens, $this->title, $this->body, $this->data, $this->categoryId);
    }
}

<?php

namespace App\Services;

use App\Enums\NotificationType;
use App\Jobs\SendPushNotification;
use App\Models\NotificationDelivery;
use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Support\Carbon;

/**
 * The one door every notification goes through.
 *
 * Nothing in the app calls ExpoPushService directly. Routing every send —
 * event-driven and scheduled alike — through this method is what makes the
 * policy actually hold: a preference that can be bypassed by one forgotten
 * call site isn't a preference, and a daily budget enforced in four places
 * is four places to get it wrong.
 */
class PushNotificationService
{
    /**
     * Nothing non-transactional goes out before 8am or after 9pm local.
     * A learning app has no business waking anyone up.
     */
    private const QUIET_HOURS_START = 8;

    private const QUIET_HOURS_END = 21;

    /**
     * Sends if — and only if — policy allows.
     *
     * @param  array<string, mixed>  $data  Deep-link payload for the app.
     * @param  array<int, array{0: NotificationType, 1: ?string}>  $alsoRecord
     *                                                                          Extra [type, dedupeKey] pairs folded into this one message by
     *                                                                          collapsing, recorded so a milestone consumed as a secondary
     *                                                                          clause can't headline tomorrow.
     * @return bool Whether it was actually queued.
     */
    public function send(
        User $user,
        NotificationType $type,
        string $title,
        string $body,
        array $data = [],
        ?string $dedupeKey = null,
        ?string $categoryId = null,
        array $alsoRecord = [],
    ): bool {
        if (! $this->isAllowed($user, $type, $dedupeKey)) {
            return false;
        }

        $tokens = $user->pushTokens()->pluck('token')->all();

        if ($tokens === []) {
            return false;
        }

        // Recorded before the send, not after. Two scheduler runs (or a
        // retried job) can otherwise both pass the checks above and both
        // dispatch; letting the unique index reject the second write is
        // the only version of this that's actually safe. The cost of the
        // trade is a notification lost if the queue dies between here and
        // delivery, which is much cheaper than sending twice.
        if (! $this->record($user, $type, $dedupeKey)) {
            return false;
        }

        foreach ($alsoRecord as [$secondaryType, $secondaryKey]) {
            $this->record($user, $secondaryType, $secondaryKey);
        }

        SendPushNotification::dispatch($tokens, $title, $body, $data, $categoryId);

        return true;
    }

    /**
     * Whether this type may be sent to this user right now — the category
     * opt-in, then dedup, then (for everything non-transactional) quiet
     * hours and the one-a-day budget.
     */
    public function isAllowed(User $user, NotificationType $type, ?string $dedupeKey = null): bool
    {
        if (! $user->{$type->category()->preferenceColumn()}) {
            return false;
        }

        if ($dedupeKey !== null && $this->alreadySent($user, $type, $dedupeKey)) {
            return false;
        }

        if ($type->isTransactional()) {
            return true;
        }

        $localNow = Carbon::now($user->timezone());

        if ($localNow->hour < self::QUIET_HOURS_START || $localNow->hour > self::QUIET_HOURS_END) {
            return false;
        }

        return ! $this->hasSentToday($user, $localNow);
    }

    private function alreadySent(User $user, NotificationType $type, string $dedupeKey): bool
    {
        return $user->notificationDeliveries()
            ->where('type', $type->value)
            ->where('dedupe_key', $dedupeKey)
            ->exists();
    }

    /**
     * The budget. Counts *any* previous delivery since the user's local
     * midnight, deliberately across categories — the point is a cap on how
     * often the app speaks, not a cap per topic. Transactional sends land
     * in this table too, but never consult it.
     */
    private function hasSentToday(User $user, Carbon $localNow): bool
    {
        return $user->notificationDeliveries()
            ->where('sent_at', '>=', $localNow->copy()->startOfDay()->utc())
            ->exists();
    }

    /**
     * @return bool False when the unique index rejected the row, meaning
     *              something else already claimed this send.
     */
    private function record(User $user, NotificationType $type, ?string $dedupeKey): bool
    {
        try {
            NotificationDelivery::create([
                'user_id' => $user->id,
                'type' => $type->value,
                'dedupe_key' => $dedupeKey,
                'sent_at' => Carbon::now(),
            ]);

            return true;
        } catch (QueryException) {
            return false;
        }
    }
}

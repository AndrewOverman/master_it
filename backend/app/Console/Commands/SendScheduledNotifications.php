<?php

namespace App\Console\Commands;

use App\Models\User;
use App\Services\PushNotificationService;
use App\Services\ScheduledNotificationPlanner;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;
use Illuminate\Support\LazyCollection;

/**
 * The one scheduled sender. Runs hourly and gives each user at most one
 * notification, at their own local nudge hour.
 *
 * Hourly rather than daily because "9am" means sixteen different moments
 * across the timezones the app is installed in, and users pick their own
 * hour. Each run therefore does nothing for the overwhelming majority of
 * users, which is fine — the query that finds the few is cheap, and the
 * alternative (a job per user per day) is far more machinery for the same
 * result.
 */
class SendScheduledNotifications extends Command
{
    protected $signature = 'notifications:scheduled
                            {--user= : Only evaluate this user id, ignoring their nudge hour (for testing)}';

    protected $description = 'Send the daily nudge to users whose local nudge hour has arrived';

    public function handle(
        ScheduledNotificationPlanner $planner,
        PushNotificationService $push,
    ): int {
        $sent = 0;
        $evaluated = 0;

        $this->eligibleUsers()->each(function (User $user) use ($planner, $push, &$sent, &$evaluated) {
            $localNow = Carbon::now($user->timezone());

            if (! $this->isDue($user, $localNow)) {
                return;
            }

            $evaluated++;

            $candidates = $planner->candidatesFor($user, $localNow);

            if ($candidates === []) {
                return;
            }

            if ($this->deliver($push, $user, $candidates)) {
                $sent++;
            }
        });

        $this->info("Evaluated {$evaluated} user(s), sent {$sent} notification(s).");

        return self::SUCCESS;
    }

    /**
     * Only users who could actually receive something. A user with no
     * registered device can't be notified, and evaluating them would mean
     * running every rule to reach a foregone conclusion.
     *
     * @return LazyCollection<int, User>
     */
    private function eligibleUsers()
    {
        $query = User::query()->whereHas('pushTokens');

        if ($id = $this->option('user')) {
            $query->whereKey($id);
        }

        return $query->lazyById(100);
    }

    /**
     * `--user` bypasses the clock so the command can be exercised by hand
     * without waiting for the right hour to come around.
     */
    private function isDue(User $user, Carbon $localNow): bool
    {
        return $this->option('user') !== null
            || $localNow->hour === (int) $user->daily_nudge_hour;
    }

    /**
     * Collapses the day's candidates into a single notification.
     *
     * The highest-priority candidate supplies the title, body, deep link
     * and any action buttons. A second one — if there is one — is appended
     * as a clause, and anything past that is dropped rather than queued:
     * it will re-qualify tomorrow, and a notification listing four things
     * is one nobody finishes reading.
     *
     * Both the headline and the clause are recorded as delivered, so a
     * once-per-plan milestone that appeared only as a clause can't headline
     * its own notification tomorrow.
     *
     * @param  array<int, array<string, mixed>>  $candidates
     */
    private function deliver(PushNotificationService $push, User $user, array $candidates): bool
    {
        $primary = $candidates[0];
        $secondary = $candidates[1] ?? null;

        // Only fold in a second item the user has actually opted into —
        // otherwise a switched-off category could still speak through
        // somebody else's notification.
        if ($secondary !== null && ! $push->isAllowed($user, $secondary['type'], $secondary['dedupeKey'])) {
            $secondary = null;
        }

        $body = $secondary === null
            ? $primary['body']
            : $primary['body'].' '.$secondary['clause'];

        return $push->send(
            $user,
            $primary['type'],
            $primary['title'],
            $body,
            data: array_merge($primary['data'], ['type' => $primary['type']->value]),
            dedupeKey: $primary['dedupeKey'],
            categoryId: $primary['categoryId'],
            alsoRecord: $secondary === null ? [] : [[$secondary['type'], $secondary['dedupeKey']]],
        );
    }
}

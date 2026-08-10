<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

Schedule::command('sanctum:prune-expired --hours=24')->daily();

// Hourly, not daily: each user has their own local nudge hour, and "9am"
// is a different moment in every timezone the app is installed in. The
// command itself decides who is actually due — see
// SendScheduledNotifications. withoutOverlapping() because a slow run must
// not be joined by the next hour's, which would evaluate the same users
// concurrently and race on the delivery ledger.
Schedule::command('notifications:scheduled')->hourly()->withoutOverlapping();

<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            // One column per category rather than a single JSON blob: the
            // hourly scheduler filters on these in SQL, and a JSON column
            // would push that filtering into PHP across the whole user
            // table. Same reasoning as the subscription columns.
            //
            // All default to true. Notifications are already gated by the
            // OS permission prompt — defaulting these to false would mean
            // someone who deliberately allowed notifications still got
            // none, with nothing on screen explaining why.
            $table->boolean('notify_plan_updates')->default(true)->after('free_generation_claimed_at');
            $table->boolean('notify_reminders')->default(true)->after('notify_plan_updates');
            $table->boolean('notify_progress')->default(true)->after('notify_reminders');
            $table->boolean('notify_account')->default(true)->after('notify_progress');

            // Hour of the user's *local* day (0-23) when the one daily
            // notification may go out. The scheduler runs hourly and picks
            // up whoever's local clock has reached this. 9am is early
            // enough to shape the day and late enough not to be an alarm.
            $table->unsignedTinyInteger('daily_nudge_hour')->default(9)->after('notify_account');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn([
                'notify_plan_updates',
                'notify_reminders',
                'notify_progress',
                'notify_account',
                'daily_nudge_hour',
            ]);
        });
    }
};

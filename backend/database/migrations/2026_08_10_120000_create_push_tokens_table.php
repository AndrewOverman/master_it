<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('push_tokens', function (Blueprint $table) {
            $table->id();

            // Indexed, unlike the other foreign keys in this schema: the
            // hourly notification scheduler loads tokens by user on every
            // run, which is the only place in the app that reads a child
            // table by owner on a timer rather than in response to a
            // request.
            $table->foreignId('user_id')->constrained()->cascadeOnDelete()->index();

            // Expo's own token format ('ExponentPushToken[...]'), not a raw
            // APNs/FCM token — delivery goes through Expo's push service.
            // Unique because the same device re-registering must update the
            // existing row rather than accumulate duplicates, and because a
            // device handed to a new account has to move with it.
            $table->string('token')->unique();

            $table->string('platform'); // 'ios' | 'android'

            // IANA zone reported by the device (expo-localization), e.g.
            // 'America/Detroit'. Stored per token rather than per user
            // because that's where the information actually comes from —
            // `users` has no timezone, and a user can carry devices across
            // zones. The scheduler resolves a user's zone from their most
            // recently seen token.
            $table->string('timezone')->default('UTC');

            // Refreshed every time the app registers. Doubles as the
            // tiebreaker when one user's devices disagree about timezone.
            $table->timestamp('last_seen_at')->nullable();

            $table->timestamps();
        });

        if (DB::getDriverName() === 'pgsql') {
            DB::statement('ALTER TABLE "push_tokens" ENABLE ROW LEVEL SECURITY');
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('push_tokens');
    }
};
